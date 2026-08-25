const lastResults = new Map();

export const store = {
  set(result) {
    lastResults.set(result.name, result);
  },
  getAll() {
    return [...lastResults.values()];
  },
};
