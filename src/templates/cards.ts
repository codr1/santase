import type { Card, Rank, Suit } from "../game/cards";

const SVG_CARDS_CDN = "/public/svg-cards.svg";
const CARD_BACK_SPRITE_ID = "back";
const CARD_BACK_URL = `${SVG_CARDS_CDN}#${CARD_BACK_SPRITE_ID}`;

type SvgSuit = "heart" | "diamond" | "club" | "spade";

const SUIT_IDS: Record<Suit, SvgSuit> = {
  hearts: "heart",
  diamonds: "diamond",
  clubs: "club",
  spades: "spade",
};

const RANK_IDS: Record<Rank, string> = {
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  A: "1",
};

const CARD_IMAGE_URLS: Record<Suit, Record<Rank, string>> = {
  hearts: {
    "9": `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS["9"]}`,
    "10": `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS["10"]}`,
    J: `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS.J}`,
    Q: `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS.Q}`,
    K: `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS.K}`,
    A: `${SVG_CARDS_CDN}#${SUIT_IDS.hearts}_${RANK_IDS.A}`,
  },
  diamonds: {
    "9": `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS["9"]}`,
    "10": `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS["10"]}`,
    J: `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS.J}`,
    Q: `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS.Q}`,
    K: `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS.K}`,
    A: `${SVG_CARDS_CDN}#${SUIT_IDS.diamonds}_${RANK_IDS.A}`,
  },
  clubs: {
    "9": `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS["9"]}`,
    "10": `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS["10"]}`,
    J: `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS.J}`,
    Q: `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS.Q}`,
    K: `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS.K}`,
    A: `${SVG_CARDS_CDN}#${SUIT_IDS.clubs}_${RANK_IDS.A}`,
  },
  spades: {
    "9": `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS["9"]}`,
    "10": `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS["10"]}`,
    J: `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS.J}`,
    Q: `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS.Q}`,
    K: `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS.K}`,
    A: `${SVG_CARDS_CDN}#${SUIT_IDS.spades}_${RANK_IDS.A}`,
  },
};

/**
 * Returns an SVG sprite fragment URL for use with <svg><use href="...">.
 */
export function getCardImageUrl(card: Card): string {
  return CARD_IMAGE_URLS[card.suit][card.rank];
}

/**
 * Returns the card back sprite fragment URL for use with <svg><use href="...">.
 */
export function getCardBackUrl(): string {
  return CARD_BACK_URL;
}
