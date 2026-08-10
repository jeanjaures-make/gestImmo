// Mock pour `server-only` en environnement de test.
// Le vrai module `server-only` lève une erreur s'il est importé hors d'un
// Server Component. En test, on l'ignore : on teste la logique pure.
export {};
