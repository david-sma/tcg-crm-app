import React from 'react';
import { useBrand } from '../../context/BrandContext.tsx';

interface LogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  textColor?: string;
}

export const CompanyLogo: React.FC<LogoProps> = ({
  className = '',
  size = 40,
  showText = false,
  textColor = 'text-slate-900',
}) => {
  const { companyName, shortName, city, logoSvg, colors } = useBrand();

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {logoSvg ? (
        <span
          className="shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
          style={{ width: size, height: size }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: logoSvg }}
        />
      ) : (
        <span
          className="shrink-0 inline-flex items-center justify-center rounded-xl font-extrabold text-white"
          style={{
            width: size,
            height: size,
            fontSize: typeof size === 'number' ? Math.max(10, size * 0.32) : '0.9em',
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          }}
          aria-hidden="true"
        >
          {shortName.slice(0, 3).toUpperCase()}
        </span>
      )}

      {showText && (
        <div className="flex flex-col">
          <span className={`text-base font-extrabold tracking-tight leading-none ${textColor}`}>
            {companyName.toUpperCase()}
          </span>
          <span
            className="text-[10px] font-bold tracking-widest uppercase mt-0.5"
            style={{ color: colors.accent }}
          >
            {city}
          </span>
        </div>
      )}
    </div>
  );
};
