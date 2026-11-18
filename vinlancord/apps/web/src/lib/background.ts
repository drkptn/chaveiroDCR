/**
 * Imagem de fundo personalizada. Fica só neste dispositivo (localStorage, chave
 * própria para não pesar nas outras configurações locais).
 */
import { create } from 'zustand';

const KEY = 'vl:bg-image';
const MAX_SIDE = 1920;
const MAX_GIF = 4 * 1024 * 1024;

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const useBackground = create<{ image: string | null }>()(() => ({ image: read() }));

export function setBackgroundImage(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KEY, dataUrl);
    else localStorage.removeItem(KEY);
  } catch {
    throw new Error('Sem espaço para guardar essa imagem neste dispositivo. Tente uma menor.');
  }
  useBackground.setState({ image: dataUrl });
}

const readAsDataUrl = (f: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(f);
  });

/**
 * Prepara a imagem escolhida: GIF/WebP animados pequenos são mantidos como estão
 * (continuam animados); o resto é reduzido para no máximo 1920 px em JPEG.
 */
export async function prepareBackground(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) throw new Error('Escolha uma imagem (PNG, JPG, WebP, GIF ou AVIF).');
  if ((file.type === 'image/gif' || file.type === 'image/webp') && file.size <= MAX_GIF) return readAsDataUrl(file);
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error('Imagem inválida ou corrompida.');
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.84);
}
