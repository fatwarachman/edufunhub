import { type CharacterLook, type ItemSlot } from './draw-character';

export const SLOT_LABELS: Record<string, string> = {
    hat: 'Hat',
    face: 'Face',
    outfit: 'Outfit',
    back: 'Back',
    weapon: 'Weapon',
    offhand: 'Shield',
};

/** Sample character that shows one item, for admin previews. */
export function itemPreview(item: {
    slot: ItemSlot;
    style: string;
    color: string | null;
}): CharacterLook {
    return {
        color: 'teal',
        gender:
            item.style === 'dress' || item.style === 'flower' ? 'girl' : 'boy',
        skin: 'light',
        hair: 'brown',
        items: { [item.slot]: { style: item.style, color: item.color } },
    };
}
