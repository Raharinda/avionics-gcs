#ifdef E32_SETUP_BUILD
#include "../../../shared/e32_setup.h"
void setup() { e32_setup::begin("RX"); }
void loop() { delay(100); }
#endif
