import { countryCode } from '../shared/countries';

// Every flag becomes its own small SVG file in the build; only the ones on screen are downloaded.
const FLAGS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

const flagUrl = (code: string): string | undefined => FLAGS[`/node_modules/flag-icons/flags/4x3/${code}.svg`];

export const Flag = ({ country, className = '' }: { country: string; className?: string }) => {
  const code = country ? countryCode(country) : null;
  const url = code ? flagUrl(code) : undefined;
  if (!url) return null;
  return (
    <img
      src={url}
      alt={country}
      title={country}
      loading="lazy"
      className={`inline-block h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`}
    />
  );
};
