import { describe, expect, it } from 'vitest';
import { mergeChunkTranscriptions } from './transcript-merge.service.js';
import { buildTranscriptChunks } from './transcript-embeddings.service.js';

describe('lecture chunk pipeline helpers', () => {
  it('merges chunk-relative timestamps into one lecture timeline', () => {
    const merged = mergeChunkTranscriptions([
      {
        chunkIndex: 1,
        durationSeconds: 5,
        rawDiarizedJson: {
          language: 'en',
          segments: [
            {
              speaker: 'speaker_1',
              text: 'second chunk opening',
              start: 0.5,
              end: 1.5,
              confidence: 0.75,
            },
          ],
        },
      },
      {
        chunkIndex: 0,
        durationSeconds: 10,
        rawDiarizedJson: {
          language: 'en',
          segments: [
            {
              speaker: 'speaker_1',
              text: 'first chunk opening',
              start: 0,
              end: 2,
              confidence: 0.9,
            },
            {
              speaker: 'speaker_2',
              text: 'first chunk question',
              start: 3,
              end: 4,
              confidence: 0.6,
            },
          ],
        },
      },
      {
        chunkIndex: 2,
        durationSeconds: 4,
        rawDiarizedJson: {
          language: 'en',
          segments: [
            {
              speaker: 'speaker_2',
              text: 'third chunk question',
              start: 0.25,
              end: 1,
              confidence: 0.8,
            },
          ],
        },
      },
    ]);

    expect(merged.totalSegments).toBe(4);
    expect(merged.segments.map((segment) => segment.segmentIndex)).toEqual([0, 1, 2, 3]);
    expect(merged.segments.map((segment) => segment.startTimeSeconds)).toEqual([0, 3, 10.5, 15.25]);
    expect(merged.segments.map((segment) => segment.endTimeSeconds)).toEqual([2, 4, 11.5, 16]);
    expect(merged.fullText).toContain('Speaker 1: first chunk opening');
    expect(merged.fullText).toContain('Speaker 2: third chunk question');
  });

  it('builds embedding chunks from processed transcript paragraphs', () => {
    const chunks = buildTranscriptChunks({
      speakers: [
        {
          originalLabel: 'speaker_1',
          role: 'professor',
          displayName: 'Professor',
          confidence: 0.95,
          rationale: 'Dominant lecturer voice',
        },
      ],
      paragraphs: [
        {
          paragraphIndex: 0,
          speakerRole: 'professor',
          speakerLabel: 'Speaker 1',
          speakerDisplayName: 'Professor',
          text: 'Today we are covering Fourier transforms.',
        },
        {
          paragraphIndex: 1,
          speakerRole: 'student',
          speakerLabel: 'Speaker 2',
          speakerDisplayName: 'Student A',
          text: 'Can you repeat the intuition behind the basis change?',
        },
      ],
      formattedText:
        'Professor: Today we are covering Fourier transforms.\n\nStudent A: Can you repeat the intuition behind the basis change?',
    });

    expect(chunks).toEqual([
      {
        chunkIndex: 0,
        speaker: 'Professor',
        content: 'Today we are covering Fourier transforms.',
        chunkText: 'Professor: Today we are covering Fourier transforms.',
      },
      {
        chunkIndex: 1,
        speaker: 'Student A',
        content: 'Can you repeat the intuition behind the basis change?',
        chunkText: 'Student A: Can you repeat the intuition behind the basis change?',
      },
    ]);
  });
});
