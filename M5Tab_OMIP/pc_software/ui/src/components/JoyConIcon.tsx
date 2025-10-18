import { SvgIcon, SvgIconProps } from "@mui/material";

export function JoyConIcon(props: SvgIconProps) {
    return (
        <SvgIcon {...props} viewBox="0 0 100 100">
            {/* Joy-Con (L) */}
            <g transform="translate(2, 10)">
                {/* ZL Button (奥) */}
                <path d="M5,0 L20,0 C25,0 30,5 30,10 L30,15 L0,15 L0,5 C0,2.5 2.5,0 5,0 Z" fill="#007EBC" />
                <text x="15" y="10" textAnchor="middle" fontSize="8" fill="white">ZL</text>

                {/* L Button (手前) */}
                <path d="M5,12 L20,12 C25,12 30,17 30,22 L30,27 L0,27 L0,17 C0,14.5 2.5,12 5,12 Z" fill="#008ECC" />

                {/* Body */}
                <path d="M25,20 C10,20 0,30 0,40 L0,80 C0,90 10,100 25,100 L35,100 L35,20 Z" transform="translate(0, -20)" fill="#00AEEF" />

                {/* Analog Stick */}
                <circle cx="17.5" cy="25" r="8" fill="#333" />
                <circle cx="17.5" cy="25" r="6" fill="#555" />
                {/* Buttons */}
                <circle cx="17.5" cy="50" r="3" fill="black" />
                <circle cx="10" cy="42" r="3" fill="black" />
                <circle cx="25" cy="42" r="3" fill="black" />
                <circle cx="17.5" cy="34" r="3" fill="black" />
                {/* Minus Button */}
                <rect x="25" y="12" width="6" height="2" fill="black" />
            </g>

            {/* Joy-Con (R) */}
            <g transform="translate(98, 10) scale(-1, 1)">
                {/* ZR Button (奥) */}
                <path d="M5,0 L20,0 C25,0 30,5 30,10 L30,15 L0,15 L0,5 C0,2.5 2.5,0 5,0 Z" fill="#CC2222" />
                <text x="15" y="10" textAnchor="middle" fontSize="8" fill="white" transform="scale(-1, 1) translate(-30, 0)">ZR</text>

                {/* R Button (手前) */}
                <path d="M5,12 L20,12 C25,12 30,17 30,22 L30,27 L0,27 L0,17 C0,14.5 2.5,12 5,12 Z" fill="#DD3333" />

                {/* Body */}
                <path d="M25,20 C10,20 0,30 0,40 L0,80 C0,90 10,100 25,100 L35,100 L35,20 Z" transform="translate(0, -20)" fill="#FF4444" />

                {/* Analog Stick */}
                <circle cx="17.5" cy="55" r="8" fill="#333" />
                <circle cx="17.5" cy="55" r="6" fill="#555" />
                {/* Buttons (A, B, X, Y) */}
                <circle cx="17.5" cy="30" r="3" fill="black" />
                <circle cx="10" cy="22" r="3" fill="black" />
                <circle cx="25" cy="22" r="3" fill="black" />
                <circle cx="17.5" cy="14" r="3" fill="black" />
                {/* Plus Button */}
                <rect x="5" y="12" width="6" height="2" fill="black" />
                <rect x="7" y="10" width="2" height="6" fill="black" />
            </g>
        </SvgIcon>
    );
}
