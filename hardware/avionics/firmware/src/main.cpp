#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <Preferences.h>
#include "mpu6050_reader.h"
#include "imu_calibration.h"
#include "imu_profile_storage.h"
#include "lora_radio.h"
#include "sensor_telemetry.h"
#include <cmath>
#include <cstring>
#include <cstdio>
#include <initializer_list>

namespace {
constexpr int kSdaPin=21, kSclPin=22;
constexpr uint32_t kSampleIntervalUs=10000, kTelemetryIntervalMs=100, kBmpIntervalMs=100;
Mpu6050Reader mpu(Wire);
Adafruit_BMP280 bmp(&Wire);
imu::CalibrationProfile profile;
imu::SixFaceCalibration calibration;
imu::AttitudeFilter filter;
imu::Quaternion reference;
imu::Vec accel{{0,0,0}}, gyro{{0,0,0}};
imu::Vec rawAccel{{0,0,0}}, rawGyro{{0,0,0}};
struct ReferenceRecord {
    uint32_t version=1;
    float quaternion[4]={1,0,0,0};
    imu::Vec accel{{0,0,0}};
    int32_t nose=3, right=1;
};
ReferenceRecord lastReference;
bool hasLastReference=false;
bool calibrated=false, referenceSet=false, mpuReady=false, bmpReady=false, imuValid=false;
int noseAxis=3, rightAxis=1;
float temperature=0, pressure=NAN, bmpTemperature=NAN;
uint8_t bmpAddress=0;
uint32_t lastSampleUs=0, lastTelemetryMs=0, lastBmpMs=0, lastRetryMs=0, lastProgressMs=0, lastValidMs=0;
String commandBuffer;
bool discardCommand=false;
uint32_t lastLoRaSendMs=0;
uint32_t loraSentPackets=0;
radio::BusyWarning loraBusyWarning;

bool present(uint8_t address) {
    Wire.beginTransmission(address);
    return Wire.endTransmission()==0;
}
void printVec(const imu::Vec& value) { Serial.printf("[%.5f,%.5f,%.5f]",value[0],value[1],value[2]); }
void printState() {
    Serial.printf("IMU_STATE:{\"firmware\":\"imu3d-v2\",\"calibrated\":%s,\"referenceSet\":%s,\"imuReady\":%s,\"noseAxis\":%d,\"rightAxis\":%d,\"profile\":",
        calibrated?"true":"false",referenceSet?"true":"false",imuValid?"true":"false",noseAxis,rightAxis);
    if (!calibrated) Serial.print("null");
    else {
        Serial.print("{\"offset\":"); printVec(profile.accel_offset);
        Serial.print(",\"scale\":"); printVec(profile.accel_scale);
        Serial.print(",\"gyroBias\":"); printVec(profile.gyro_bias);
        Serial.print(",\"poses\":[");
        for (int face=0;face<6;++face) {
            if (face) Serial.print(',');
            Serial.printf("{\"face\":\"%s\",\"samples\":%lu,\"accel\":",imu::face_names[face],static_cast<unsigned long>(profile.samples[face]));
            printVec(profile.face_accel[face]); Serial.print('}');
        }
        Serial.print("]}");
    }
    Serial.print(",\"lastReference\":");
    if (!hasLastReference) Serial.print("null");
    else {
        Serial.print("{\"accel\":"); printVec(lastReference.accel);
        Serial.printf(",\"orientation\":[%.7f,%.7f,%.7f,%.7f],\"noseAxis\":%d,\"rightAxis\":%d}",
            lastReference.quaternion[0],lastReference.quaternion[1],lastReference.quaternion[2],lastReference.quaternion[3],static_cast<int>(lastReference.nose),static_cast<int>(lastReference.right));
    }
    Serial.println('}');
}
void printProgress() {
    const auto& saved=calibration.active ? calibration.staged : profile;
    Serial.printf("CALIBRATION_STATUS:{\"active\":%s,\"face\":",calibration.active?"true":"false");
    if (calibration.face>=0) Serial.printf("\"%s\"",imu::face_names[calibration.face]); else Serial.print("null");
    Serial.printf(",\"samples\":%lu,\"target\":%lu,\"completed\":[",static_cast<unsigned long>(calibration.count),static_cast<unsigned long>(imu::samples_per_face));
    bool first=true;
    for (int face=0;face<6;++face) if (saved.samples[face]>=imu::samples_per_face) {
        if (!first) Serial.print(',');
        first=false; Serial.printf("\"%s\"",imu::face_names[face]);
    }
    Serial.println("]}");
}
void loadProfile() {
    Preferences storage;
    if (!storage.begin("imu-cal-v2",true)) return;
    imu::CalibrationProfile loaded;
    if (storage.getBytesLength("profile")==sizeof(loaded) &&
        storage.getBytes("profile",&loaded,sizeof(loaded))==sizeof(loaded) && imu::valid_profile(loaded)) {
        profile=loaded; calibrated=true;
    }
    int32_t mount[2]={3,1};
    if (storage.getBytesLength("mount")==sizeof(mount) && storage.getBytes("mount",mount,sizeof(mount))==sizeof(mount) && imu::valid_mount(mount[0],mount[1])) {
        noseAxis=mount[0]; rightAxis=mount[1];
    }
    ReferenceRecord saved;
    if (calibrated && storage.getBytesLength("reference")==sizeof(saved) &&
        storage.getBytes("reference",&saved,sizeof(saved))==sizeof(saved) && saved.version==1 &&
        imu::finite(saved.accel) && imu::valid_mount(saved.nose,saved.right)) {
        imu::Quaternion q(saved.quaternion[0],saved.quaternion[1],saved.quaternion[2],saved.quaternion[3]);
        if (q.normalize()) { lastReference=saved; hasLastReference=true; }
    }
    storage.end();
}
void saveProfile() {
    imu::CalibrationProfile next;
    if (!calibration.finish(next)) { Serial.println("CALIBRATION_ERROR:Lengkapi enam posisi yang valid terlebih dahulu"); return; }
    Preferences storage;
    if (!storage.begin("imu-cal-v2",false)) { Serial.println("CALIBRATION_ERROR:Gagal membuka penyimpanan ESP32"); return; }
    const bool saved=storage.putBytes("profile",&next,sizeof(next))==sizeof(next);
    if (saved) storage.remove("reference");
    storage.end();
    if (!saved) { Serial.println("CALIBRATION_ERROR:Gagal menyimpan profil; profil lama dipertahankan"); return; }
    profile=next; calibrated=true; hasLastReference=false;
    calibration.cancel(); filter.reset(); referenceSet=false;
    Serial.println("CALIBRATION_COMPLETE:Enam posisi tersimpan di ESP32");
    printState(); printProgress();
}
void resetCalibration() {
    // Stop capture first, so it cannot save a new profile during a reset/retry.
    calibration.cancel();
    Preferences storage;
    const auto result=imu::erase_calibration(storage);
    if (result==imu::EraseCalibrationResult::Done || result==imu::EraseCalibrationResult::ProfileFailed) {
        lastReference=ReferenceRecord{}; hasLastReference=false;
        reference=imu::Quaternion{}; referenceSet=false;
    }
    if (result==imu::EraseCalibrationResult::Done) {
        profile=imu::CalibrationProfile{}; calibrated=false;
        calibration.staged=imu::CalibrationProfile{};
        filter.reset();
        // The next telemetry frame must already contain uncorrected readings.
        accel=rawAccel; gyro=rawGyro;
    }
    printState(); printProgress();
    if (result==imu::EraseCalibrationResult::Done)
        Serial.println("CALIBRATION_RESET");
    else
        Serial.println("CALIBRATION_RESET_ERROR:Sesi dihentikan, tetapi profil/acuan belum berhasil dihapus dari penyimpanan ESP32. Coba lagi.");
}
void diagnostics() {
    Serial.print("MPU6050 diagnostics:");
    const uint8_t registers[]={0x75,0x6B,0x6C,0x1A,0x1B,0x1C};
    const char* names[]={"WHO_AM_I","PWR1","PWR2","CONFIG","GYRO_CONFIG","ACCEL_CONFIG"};
    for (int i=0;i<6;++i) {
        uint8_t value=0;
        if (mpu.read_register(registers[i],value)) Serial.printf(" %s=0x%02X",names[i],value);
        else Serial.printf(" %s=READ_FAILED",names[i]);
    }
    Serial.println();
}
void initSensors() {
    if (!mpuReady) {
        for (uint8_t address : {0x68,0x69}) {
            if (!present(address)) continue;
            const auto status=mpu.begin(address);
            if (status==Mpu6050Reader::Status::Ok) {
                mpuReady=true; imuValid=false;
                filter.reset(); referenceSet=false;
                lastSampleUs=micros();
                Serial.printf("MPU6050 siap di 0x%02X\n",address);
                diagnostics(); break;
            }
            Serial.printf("MPU6050: %s\n",Mpu6050Reader::message(status)); diagnostics();
        }
    }
    if (!bmpReady) for (uint8_t address : {0x76,0x77}) {
        if (present(address) && bmp.begin(address)) {
            bmp.setSampling(Adafruit_BMP280::MODE_SLEEP); delay(100);
            // Keep pressure precision, with short standby and a low-latency filter.
            bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,Adafruit_BMP280::SAMPLING_X2,
                Adafruit_BMP280::SAMPLING_X16,Adafruit_BMP280::FILTER_X2,Adafruit_BMP280::STANDBY_MS_1);
            bmpReady=true; bmpAddress=address; Serial.printf("BMP280 siap di 0x%02X\n",address); break;
        }
    }
}
void command(const String& input) {
    if (input=="IMU_STATUS") { printState(); printProgress(); }
    else if (input=="CALIBRATE_START") {
        if (!imuValid) { Serial.println("CALIBRATION_ERROR:MPU6050 belum memberikan data valid"); return; }
        calibration.start(); referenceSet=false;
        Serial.println("CALIBRATION_STARTED"); printProgress(); printState();
    } else if (input.startsWith("CALIBRATE_FACE:")) {
        const String face=input.substring(std::strlen("CALIBRATE_FACE:"));
        int index=-1;
        for (int i=0;i<6;++i) if (face==imu::face_names[i]) index=i;
        if (!imuValid || !calibration.capture(index)) { Serial.println("CALIBRATION_ERROR:Mulai sesi kalibrasi, lalu pilih posisi yang valid"); return; }
        printProgress();
    } else if (input=="CALIBRATE_CANCEL") {
        calibration.cancel(); Serial.println("CALIBRATION_CANCELLED"); printProgress(); printState();
    } else if (input=="CALIBRATE_RESET") {
        resetCalibration();
    } else if (input=="CALIBRATE_FINISH") saveProfile();
    else if (input.startsWith("IMU_MOUNT:")) {
        int nose=0,right=0; char extra=0;
        if (::sscanf(input.c_str(),"IMU_MOUNT:%d,%d%c",&nose,&right,&extra)!=2 || !imu::valid_mount(nose,right)) {
            Serial.println("CALIBRATION_ERROR:Sumbu hidung dan kanan harus berbeda dan tegak lurus"); return;
        }
        if (nose!=noseAxis || right!=rightAxis) {
            Preferences storage; int32_t mount[2]={nose,right};
            if (!storage.begin("imu-cal-v2",false)) { Serial.println("CALIBRATION_ERROR:Gagal membuka penyimpanan pemasangan"); return; }
            const bool saved=storage.putBytes("mount",mount,sizeof(mount))==sizeof(mount); storage.end();
            if (!saved) { Serial.println("CALIBRATION_ERROR:Gagal menyimpan pemasangan"); return; }
            noseAxis=nose; rightAxis=right; referenceSet=false;
        }
        printState();
    } else if (input=="IMU_REFERENCE" || input.startsWith("IMU_REFERENCE:")) {
        int requestedNose=noseAxis, requestedRight=rightAxis; char extra=0;
        if (input!="IMU_REFERENCE" &&
            (::sscanf(input.c_str(),"IMU_REFERENCE:%d,%d%c",&requestedNose,&requestedRight,&extra)!=2 || !imu::valid_mount(requestedNose,requestedRight))) {
            Serial.println("CALIBRATION_ERROR:Sumbu hidung dan kanan harus berbeda dan tegak lurus"); return;
        }
        if (!calibrated || calibration.active || !imuValid || !filter.initialized ||
            millis()-lastValidMs>200 || imu::norm(gyro)>0.12F || std::fabs(imu::norm(accel)-imu::gravity)>0.12F*imu::gravity) {
            Serial.println("CALIBRATION_ERROR:Lengkapi enam posisi, lalu tahan roket diam untuk menetapkan acuan"); return;
        }
        ReferenceRecord record;
        record.quaternion[0]=filter.orientation.w; record.quaternion[1]=filter.orientation.x;
        record.quaternion[2]=filter.orientation.y; record.quaternion[3]=filter.orientation.z;
        record.accel=accel; record.nose=requestedNose; record.right=requestedRight;
        Preferences storage;
        if (!storage.begin("imu-cal-v2",false)) { Serial.println("CALIBRATION_ERROR:Gagal membuka penyimpanan acuan"); return; }
        const int32_t mount[2]={requestedNose,requestedRight};
        const bool mountSaved=storage.putBytes("mount",mount,sizeof(mount))==sizeof(mount);
        const bool saved=mountSaved && storage.putBytes("reference",&record,sizeof(record))==sizeof(record); storage.end();
        if (!saved) { Serial.println("CALIBRATION_ERROR:Gagal menyimpan catatan posisi acuan"); return; }
        noseAxis=requestedNose; rightAxis=requestedRight;
        lastReference=record; hasLastReference=true;
        reference=filter.orientation; referenceSet=true;
        Serial.println("REFERENCE_SET:Posisi sekarang menjadi acuan nol 3D"); printState();
    }
}
void serialCommands() {
    while (Serial.available()) {
        const char c=static_cast<char>(Serial.read());
        if (c=='\r') continue;
        if (c=='\n') {
            if (!discardCommand && commandBuffer.length()) command(commandBuffer);
            commandBuffer=""; discardCommand=false;
        } else if (!discardCommand) {
            if (commandBuffer.length()<80) commandBuffer+=c;
            else { commandBuffer=""; discardCommand=true; Serial.println("CALIBRATION_ERROR:Perintah terlalu panjang"); }
        }
    }
}
void sampleImu(uint32_t nowUs) {
    const bool hadReference=referenceSet;
    const float dt=static_cast<uint32_t>(nowUs-lastSampleUs)*1e-6F;
    lastSampleUs=nowUs;
    if (!mpuReady) return;
    Mpu6050Reader::Sample sample{};
    const auto status=mpu.read(sample);
    if (status!=Mpu6050Reader::Status::Ok) {
        Serial.printf("MPU6050: %s\n",Mpu6050Reader::message(status)); diagnostics();
        imuValid=false; mpuReady=false; referenceSet=false; filter.reset();
        if (calibration.active) { calibration.cancel(); Serial.println("CALIBRATION_ERROR:Sesi dibatalkan karena pembacaan MPU gagal; profil lama tetap tersimpan"); printProgress(); }
        lastRetryMs=millis(); printState(); return;
    }
    const bool wasValid=imuValid;
    imuValid=true; lastValidMs=millis(); temperature=sample.temperature_c;
    rawAccel={{sample.accel[0],sample.accel[1],sample.accel[2]}};
    rawGyro={{sample.gyro[0],sample.gyro[1],sample.gyro[2]}};
    if (calibration.active) {
        if (calibration.add(rawAccel,rawGyro)) {
            printProgress();
            if (calibration.complete()) saveProfile();
        } else if (calibration.face>=0 && millis()-lastProgressMs>=200) { lastProgressMs=millis(); printProgress(); }
    }
    accel=calibrated?imu::corrected_accel(profile,rawAccel):rawAccel;
    gyro=calibrated?imu::corrected_gyro(profile,rawGyro):rawGyro;
    if (dt>0.5F) { filter.reset(); referenceSet=false; }
    const float elapsed=dt<=0.5F?dt:0.01F;
    const int steps=static_cast<int>(std::ceil(elapsed/0.01F));
    for (int step=0;step<steps;++step) {
        if (!filter.update(accel,gyro,elapsed/steps)) referenceSet=false;
    }
    if (!wasValid) printState();
    else if (hadReference && !referenceSet) printState();
}
void readBmp() {
    if (!bmpReady) return;
    if (!present(bmpAddress)) { bmpReady=false; pressure=NAN; return; }
    bmpTemperature=bmp.readTemperature(); pressure=bmp.readPressure()/100.0F;
    if (!std::isfinite(bmpTemperature) || !std::isfinite(pressure) || pressure<=0) { bmpReady=false; pressure=NAN; }
}
void serviceLoRa(uint32_t now) {
    const bool radioReady=radio::readyToSend(now);
    if (loraBusyWarning.update(radioReady,now))
        Serial.println("# LORA E22 AUX belum siap selama >=5000ms; periksa AUX=GPIO23, M0/M1=GND dan catu");
    if (!radioReady) return;
    if (now-lastLoRaSendMs<radio::kTelemetryIntervalMs) return;
    lastLoRaSendMs=now;
    if (!imuValid || now-lastValidMs>200) {
        Serial.println("# E22 SENSOR TX menunggu sampel MPU6050 valid; periksa sensor pada transmitter");
        return;
    }

    // A complete JSON line fits in the E22 buffer; the module automatically
    // splits it into RF packets. USB telemetry/calibration remain independent.
    char payload[radio::kMaxFrameBytes+1];
    sensor_telemetry::Sample sample;
    sample.timestampMs=now;
    sample.temperatureC=temperature;
    sample.pressureHpa=pressure;
    sample.accel={{accel[0],accel[1],accel[2]}};
    sample.gyro={{gyro[0],gyro[1],gyro[2]}};
    sample.calibrated=calibrated;
    const size_t length=sensor_telemetry::encodeLine(sample,payload,sizeof(payload));
    if (length==0) {
        Serial.println("# E22 SENSOR TX sampel tidak finite atau frame terlalu panjang; tidak dikirim");
        return;
    }
    if (radio::sendLine(payload,length,now)) {
        ++loraSentPackets;
        Serial.printf("# E22 SENSOR TX packet=%lu bytes=%u imu=OK baro=%s | UART lokal, bukan ACK\n",
            static_cast<unsigned long>(loraSentPackets),static_cast<unsigned int>(length),
            std::isfinite(pressure) && pressure>0?"OK":"UNAVAILABLE");
    } else
        Serial.println("# LORA E22 UART sibuk/gagal; sampel dilewati");
}
void telemetry(uint32_t now) {
    imu::Quaternion relative;
    const bool orientationValid=imuValid && calibrated && referenceSet && filter.initialized;
    if (orientationValid) {
        const auto mount=imu::mounting_rotation(noseAxis,rightAxis);
        relative=mount*(reference.conjugate()*filter.orientation)*mount.conjugate();
        relative.normalize();
    }
    Serial.printf("{\"timestampMs\":%lu,\"temperature\":%.2f,\"pressure\":",static_cast<unsigned long>(now),temperature);
    if (std::isfinite(pressure)) Serial.printf("%.2f",pressure); else Serial.print("null");
    Serial.printf(",\"accelX\":%.5f,\"accelY\":%.5f,\"accelZ\":%.5f,\"gyroX\":%.6f,\"gyroY\":%.6f,\"gyroZ\":%.6f,\"imuValid\":%s,\"calibrated\":%s,\"referenceSet\":%s,\"orientation\":",
        accel[0],accel[1],accel[2],gyro[0],gyro[1],gyro[2],imuValid?"true":"false",calibrated?"true":"false",referenceSet?"true":"false");
    if (orientationValid) Serial.printf("[%.7f,%.7f,%.7f,%.7f]",relative.w,relative.x,relative.y,relative.z);
    else Serial.print("null");
    Serial.println('}');
}
} // namespace

void setup() {
    Serial.setTxBufferSize(2048);
    Serial.begin(115200); delay(500); commandBuffer.reserve(80);
    Serial.println("\nFirmware: imu3d-v2 | MPU6050 + BMP280 | SDA=D21 SCL=D22");
    if (!Wire.begin(kSdaPin,kSclPin,100000)) { Serial.println("MPU6050: Gagal membuka bus I2C"); while (true) delay(1000); }
    Wire.setTimeOut(20); loadProfile(); initSensors(); printState(); printProgress();
    radio::begin();
    Serial.println("# E22 SENSOR TELEMETRY ROLE=TX | MPU6050 + BMP280 | JSON sensor melalui radio");
    Serial.println("# LORA E22 UART siap | baud=9600 RX=16 TX=17 AUX=23 | M0=M1=GND | interval=2000ms");
    Serial.println("# LORA E22-400T30D memakai konfigurasi tersimpan: transparent 9600 8N1, RSSI byte OFF; alamat/NETID/channel/air rate/key harus cocok");
    lastSampleUs=micros(); lastRetryMs=millis();
}
void loop() {
    const uint32_t nowUs=micros();
    if (static_cast<uint32_t>(nowUs-lastSampleUs)>=kSampleIntervalUs) sampleImu(nowUs);
    serialCommands();
    const uint32_t now=millis();
    if (now-lastBmpMs>=kBmpIntervalMs) { lastBmpMs=now; readBmp(); }
    serviceLoRa(now);
    if (now-lastTelemetryMs>=kTelemetryIntervalMs) { lastTelemetryMs=now; telemetry(now); }
    if ((!mpuReady || !bmpReady) && now-lastRetryMs>=5000) {
        lastRetryMs=now; initSensors(); printState();
    }
    delay(1);
}
