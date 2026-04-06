import axios from 'axios';

// ---------------------
// Updated Interfaces
// ---------------------

// Ora la categoria è array di stringhe (con union type se vuoi usare i valori definiti)
export interface Topic {
  id: string;
  title: string;
  description: string;
  category: Array<'basics' | 'algorithms' | 'applications' | 'privacy' | 'systems'>;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  // Se serve tipizzare tags o content, aggiungili qui come optional
}

// Facoltativo, se hai un file algorithms.json con la stessa struttura
export interface Algorithm {
  id: string;
  name: string;
  paper: string;
  authors: string;
  year: number;
  description: string;
  advantages: string[];
  limitations: string[];
  use_cases: string[];
}

// Aggiungiamo la proprietà category come array
export interface Paper {
  id: string;
  title: string;
  authors: Author[];
  conference: string;
  year: number;
  abstract: string;
  tags: string[];
  category: Array<'basics' | 'algorithms' | 'applications' | 'privacy' | 'systems'>;
  citations: number;
  url?: string;
  pdf_link?: string;
}

export interface Author {
  name: string;
  affiliation?: string;
}

// ---------------------
// Data Loader Functions
// ---------------------

export const loadTopics = async (): Promise<Topic[]> => {
  try {
    const response = await axios.get<Topic[]>('/data/topics.json');
    return response.data;
  } catch (error) {
    console.error('Error loading topics:', error);
    return [];
  }
};

export const loadAlgorithms = async (): Promise<Algorithm[]> => {
  try {
    const response = await axios.get<Algorithm[]>('/data/algorithms.json');
    return response.data;
  } catch (error) {
    console.error('Error loading algorithms:', error);
    return [];
  }
};

export const loadPapers = async (): Promise<Paper[]> => {
  try {
    const response = await axios.get<Paper[]>('/data/papers.json');
    return response.data;
  } catch (error) {
    console.error('Error loading papers:', error);
    return [];
  }
};
