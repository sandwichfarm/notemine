/**
 * Emoji metadata used across the GUI.
 */
export interface Emoji {
  shortcode: string;
  url: string;
  m?: string; // MIME type
  w?: number; // width
  h?: number; // height
  alt?: string; // alt text
}
