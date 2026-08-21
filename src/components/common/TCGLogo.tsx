import React from 'react';

interface LogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  textColor?: string;
}

export const TCGLogo: React.FC<LogoProps> = ({
  className = '',
  size = 40,
  showText = false,
  textColor = 'text-slate-900',
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* SVG Icon matching The Cleaning Guys leaf + vacuum cleaner mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Top Leaf Accent (Fresh Green #7FD858 & Bright Blue #5095FC) */}
        <path
          d="M136 38 C144 24, 158 18, 168 20 C166 32, 156 42, 142 46 C138 43, 136 40, 136 38 Z"
          fill="#5371FF"
        />
        <path
          d="M142 46 C149 32, 157 26, 165 22"
          stroke="#7FD858"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Large outer C-shaped circular curve */}
        <path
          d="M165 82 C163 56, 140 38, 110 38 C68 38, 38 72, 38 114 C38 152, 68 182, 114 182 C134 182, 150 174, 160 162"
          stroke="#5371FF"
          strokeWidth="11"
          strokeLinecap="round"
        />

        {/* Secondary inner leaf swoosh */}
        <path
          d="M106 46 C142 48, 172 68, 172 88 C146 88, 116 70, 106 46 Z"
          fill="#5095FC"
        />

        {/* Vacuum Cleaner Handle & Pipe */}
        <path
          d="M78 68 H118 M98 68 V86 C98 104, 62 102, 62 124 V138 H80"
          stroke="#5371FF"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Vacuum Cleaner Body Shell (Bright Blue & Fresh Green tint) */}
        <path
          d="M92 164 C84 150, 84 126, 108 112 C136 100, 164 116, 166 142 C167 154, 158 164, 144 164 Z"
          fill="#5095FC"
          fillOpacity="0.15"
          stroke="#5371FF"
          strokeWidth="8"
          strokeLinejoin="round"
        />

        {/* Vacuum Wheel Outer & Inner (Blue & Green Accent) */}
        <circle
          cx="140"
          cy="154"
          r="19"
          stroke="#5371FF"
          strokeWidth="8"
          fill="#FFFFFF"
        />
        <circle
          cx="140"
          cy="154"
          r="9"
          fill="#7FD858"
        />
        <circle
          cx="140"
          cy="154"
          r="4"
          fill="#5371FF"
        />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className={`text-base font-extrabold tracking-tight leading-none ${textColor}`}>
            THE CLEANING GUYS
          </span>
          <span className="text-[10px] font-bold tracking-widest text-[#7FD858] uppercase mt-0.5">
            AUCKLAND
          </span>
        </div>
      )}
    </div>
  );
};
