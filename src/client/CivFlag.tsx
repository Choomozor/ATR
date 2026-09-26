import { CIV_FLAG_FILE, civName } from './format';

// Civilization flags from Age of Empires IV (© Microsoft), used under Microsoft's Game Content Usage Rules.
const FLAGS = import.meta.glob<string>('./assets/civs/*.png', { eager: true, import: 'default' });

export const CivFlag = ({ civ, className = '' }: { civ: string; className?: string }) => {
  const file = CIV_FLAG_FILE[civ];
  const url = file ? FLAGS[`./assets/civs/${file}.png`] : undefined;
  if (!url) {
    return <span className={`inline-block h-4 w-7 shrink-0 rounded-sm bg-stone-200 dark:bg-stone-700 ${className}`} aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      title={civName(civ)}
      loading="lazy"
      className={`inline-block h-4 w-7 shrink-0 rounded-sm object-cover ring-1 ring-black/10 ${className}`}
    />
  );
};
