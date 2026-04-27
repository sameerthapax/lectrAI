const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export type RemoteStoredFlashcardRecord = {
  id: string;
  lectureId: string | null;
  frontText: string;
  backText: string;
  hintText: string | null;
  explanation: string | null;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  cardOrder: number;
  sourceSegmentIndex: number | null;
  createdAt: string | null;
};

export type RemoteStoredFlashcardSetRecord = {
  id: string;
  lectureId: string | null;
  generatedByUserId: string | null;
  title: string | null;
  description: string | null;
  scope: string;
  cardCount: number | null;
  sourceCount: number | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  cards: RemoteStoredFlashcardRecord[];
};

export type RemoteStoredFlashcardSetBundle = {
  flashcardSet: RemoteStoredFlashcardSetRecord;
};

function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL to enable flashcard backend calls.');
  }

  return API_BASE_URL;
}

async function authorizedJsonRequest<TResponse>(path: string, accessToken: string): Promise<TResponse> {
  const response = await fetch(`${requireApiBaseUrl()}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}

export async function fetchFlashcardSetById(accessToken: string, flashcardSetId: string) {
  return authorizedJsonRequest<RemoteStoredFlashcardSetBundle>(
    `/flashcards/${encodeURIComponent(flashcardSetId)}`,
    accessToken
  );
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error ?? data.message ?? 'Request failed. Please try again.';
  } catch {
    return 'Request failed. Please try again.';
  }
}
