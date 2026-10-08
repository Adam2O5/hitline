const TIMEOUT_MS = 1500;

/**
 * Canvas nie wyzwala ładowania czcionek, więc ładujemy Antona jawnie (podzbiory latin i latin-ext)
 * i czekamy najwyżej TIMEOUT_MS; po przekroczeniu gra startuje z czcionką zapasową.
 */
export async function loadFonts(): Promise<void> {
  const load = Promise.all([
    document.fonts.load('400 1em Anton'),
    document.fonts.load('400 1em Anton', 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż'),
  ]).then(() => undefined, () => undefined);
  const timeout = new Promise<void>(resolve => setTimeout(resolve, TIMEOUT_MS));
  await Promise.race([load, timeout]);
}
