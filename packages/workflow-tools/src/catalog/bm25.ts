/** Okapi BM25 — standard defaults (Robertson/Sparck Jones); tuned for short catalog-entry documents, not long-form text. */
const K1 = 1.5;
const B = 0.75;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

interface IIndexedDocument<T> {
  id: string;
  termFrequency: Map<string, number>;
  length: number;
  payload: T;
}

export interface IBm25SourceDocument<T> {
  id: string;
  text: string;
  payload: T;
}

export interface IBm25Result<T> {
  id: string;
  score: number;
  payload: T;
}

/** A small in-memory BM25 index — built once per search_nodes call (23 node types is nothing to re-tokenize on every query) rather than persisted, since the catalog only changes when a node package is (re)loaded. */
export class Bm25Index<T> {
  private readonly documents: Array<IIndexedDocument<T>> = [];
  private readonly documentFrequency = new Map<string, number>();
  private readonly averageDocumentLength: number;

  constructor(source: Array<IBm25SourceDocument<T>>) {
    for (const doc of source) {
      const tokens = tokenize(doc.text);
      const termFrequency = new Map<string, number>();
      for (const token of tokens) termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      for (const token of termFrequency.keys()) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
      }
      this.documents.push({ id: doc.id, termFrequency, length: tokens.length, payload: doc.payload });
    }
    const totalLength = this.documents.reduce((sum, doc) => sum + doc.length, 0);
    this.averageDocumentLength = this.documents.length > 0 ? totalLength / this.documents.length : 0;
  }

  private inverseDocumentFrequency(term: string): number {
    const n = this.documents.length;
    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  search(query: string, limit = 10): Array<IBm25Result<T>> {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const results = this.documents.map((doc) => {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.termFrequency.get(term) ?? 0;
        if (tf === 0) continue;
        const idf = this.inverseDocumentFrequency(term);
        const denominator = tf + K1 * (1 - B + (B * doc.length) / (this.averageDocumentLength || 1));
        score += idf * ((tf * (K1 + 1)) / denominator);
      }
      return { id: doc.id, score, payload: doc.payload };
    });

    return results
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
