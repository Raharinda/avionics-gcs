import type { ElementType, ReactNode } from "react";
type CardProps = {
    children: ReactNode;
    className?: string;
    as?: ElementType;
};
export function Card({ children, className = "", as: Component = "article" }: CardProps) {
    return <Component className={`card ${className}`}>{children}</Component>;
}
