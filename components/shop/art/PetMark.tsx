import { Emoji } from '@/components/ui/emoji';
import { PetArt, hasPetArt } from './PetArt';

/** A pet's picture: its drawn art when it has one, its emoji otherwise (see BadgeMark.tsx). */
export function PetMark({
  pet,
  size,
  title,
  className,
}: {
  pet: { art?: string; emoji?: string } | undefined | null;
  size: number;
  title?: string;
  className?: string;
}) {
  if (!pet) return null;
  if (hasPetArt(pet.art)) {
    return <PetArt id={pet.art as string} size={size} className={className} {...(title ? { title } : {})} />;
  }
  if (!pet.emoji) return null;
  return (
    <span className={className} title={title}>
      <Emoji size={size}>{pet.emoji}</Emoji>
    </span>
  );
}
