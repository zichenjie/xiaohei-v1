export function bubbleLayout(pet, anchor, work) {
    const width = Math.min(work.width, Math.round(Math.max(210, Math.min(280, pet.width * 0.65))));
    const height = Math.min(work.height, 110);
    const headX = pet.x + anchor.x;
    const headY = pet.y + anchor.y;
    const above = headY - height - 12;
    const below = above < work.y + 4;
    return {
        width, height,
        x: Math.round(Math.max(work.x, Math.min(headX - width / 2, work.x + work.width - width))),
        y: Math.round(Math.max(work.y, Math.min(below ? headY + anchor.width * 2.2 + 12 : above, work.y + work.height - height)))
    };
}
