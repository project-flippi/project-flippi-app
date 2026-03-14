// src/main/services/aiService.ts
// AI title/description/thumbnail generation — port of AI_functions.py
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import log from 'electron-log';
import { net } from 'electron';
import type { AppSettings } from '../settings/schema';
import { getEventDb } from '../database/db';

// ---------------------------------------------------------------------------
// Similarity check (port of is_too_similar using SequenceMatcher-like logic)
// ---------------------------------------------------------------------------

function similarityRatio(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (!la || !lb) return 0;

  // Simple longest common subsequence ratio
  const m = la.length;
  const n = lb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        la[i - 1] === lb[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return (2 * dp[m][n]) / (m + n);
}

function isTooSimilar(
  title: string,
  eventName: string,
  threshold = 0.7,
): boolean {
  try {
    const db = getEventDb(eventName);
    const rows = db
      .prepare<[], { title: string }>('SELECT title FROM title_history')
      .all();
    return rows.some((row) => similarityRatio(title, row.title) >= threshold);
  } catch {
    return false;
  }
}

function appendTitleHistory(eventName: string, title: string): void {
  const db = getEventDb(eventName);
  db.prepare('INSERT INTO title_history (title) VALUES (?)').run(title);
}

// ---------------------------------------------------------------------------
// HTTP helper using Electron net module
// ---------------------------------------------------------------------------

function httpPost(
  url: string,
  headers: Record<string, string>,
  body: any,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url,
    });

    Object.entries(headers).forEach(([key, value]) => {
      request.setHeader(key, value);
    });

    let responseData = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });
      response.on('end', () => {
        try {
          resolve({
            status: response.statusCode,
            data: JSON.parse(responseData),
          });
        } catch {
          resolve({ status: response.statusCode, data: responseData });
        }
      });
    });

    request.on('error', (err) => reject(err));
    request.write(JSON.stringify(body));
    request.end();
  });
}

// ---------------------------------------------------------------------------
// Provider-specific text generation
// ---------------------------------------------------------------------------

async function generateTextOpenAI(
  prompt: string,
  systemPrompt: string,
  apiKey: string,
): Promise<string> {
  const res = await httpPost(
    'https://api.openai.com/v1/chat/completions',
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.8,
    },
  );
  if (res.status !== 200) {
    throw new Error(
      `OpenAI API error ${res.status}: ${JSON.stringify(res.data)}`,
    );
  }
  return res.data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateTextClaude(
  prompt: string,
  systemPrompt: string,
  apiKey: string,
): Promise<string> {
  const res = await httpPost(
    'https://api.anthropic.com/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    },
  );
  if (res.status !== 200) {
    throw new Error(
      `Claude API error ${res.status}: ${JSON.stringify(res.data)}`,
    );
  }
  return res.data.content?.[0]?.text?.trim() ?? '';
}

async function generateTextGemini(
  prompt: string,
  systemPrompt: string,
  apiKey: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await httpPost(
    url,
    { 'Content-Type': 'application/json' },
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
    },
  );
  if (res.status !== 200) {
    throw new Error(
      `Gemini API error ${res.status}: ${JSON.stringify(res.data)}`,
    );
  }
  return res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

async function generateText(
  prompt: string,
  systemPrompt: string,
  settings: AppSettings,
): Promise<string> {
  const { provider, apiKey } = settings.textAi;
  if (!apiKey) throw new Error('Text AI API key not configured.');

  switch (provider) {
    case 'openai':
      return generateTextOpenAI(prompt, systemPrompt, apiKey);
    case 'claude':
      return generateTextClaude(prompt, systemPrompt, apiKey);
    case 'gemini':
      return generateTextGemini(prompt, systemPrompt, apiKey);
    default:
      throw new Error(`Unknown text AI provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TITLE_SYSTEM_PROMPT = `You are a creative title writer for Super Smash Bros. Melee combo clips on YouTube. Generate a short, catchy, exciting title (max 60 characters). Do not use quotes. Make it hype and engaging for the Melee community.`;

const DESC_SYSTEM_PROMPT = `You are a YouTube SEO expert for Super Smash Bros. Melee content. Write a short, engaging description (2-3 sentences) with relevant keywords. Include hashtags. Do not use quotes around the description.`;

export async function generateClipTitle(
  prompt: string,
  eventName: string,
  settings: AppSettings,
): Promise<{ ok: boolean; title?: string }> {
  try {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const title = await generateText(prompt, TITLE_SYSTEM_PROMPT, settings);

      if (title) {
        const tooSimilar = isTooSimilar(title, eventName);
        if (!tooSimilar) {
          appendTitleHistory(eventName, title);
          return { ok: true, title };
        }
        log.info(`[ai] Title too similar, retrying (attempt ${attempt + 1})`);
      }
    }

    // Final attempt — use whatever we get
    const title = await generateText(prompt, TITLE_SYSTEM_PROMPT, settings);
    if (title) {
      appendTitleHistory(eventName, title);
      return { ok: true, title };
    }

    return { ok: false };
  } catch (err: any) {
    log.error(`[ai] generateClipTitle failed: ${err.message}`);
    return { ok: false };
  }
}

export async function generateDescription(
  title: string,
  settings: AppSettings,
): Promise<{ ok: boolean; description?: string }> {
  try {
    const prompt = `Write a YouTube description for a Super Smash Bros. Melee combo clip titled: "${title}"`;
    const description = await generateText(
      prompt,
      DESC_SYSTEM_PROMPT,
      settings,
    );
    return { ok: true, description };
  } catch (err: any) {
    log.error(`[ai] generateDescription failed: ${err.message}`);
    return { ok: false };
  }
}

export async function generateThumbnail(
  title: string,
  settings: AppSettings,
): Promise<{ ok: boolean; thumbnailPath?: string }> {
  try {
    const { provider, apiKey } = settings.imageAi;
    if (!apiKey) throw new Error('Image AI API key not configured.');

    const imagePrompt = `A dynamic, colorful YouTube thumbnail for a Super Smash Bros. Melee video titled "${title}". Energetic, gaming aesthetic, bright colors, action-packed.`;

    if (provider === 'openai') {
      const res = await httpPost(
        'https://api.openai.com/v1/images/generations',
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        {
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1792x1024',
          response_format: 'b64_json',
        },
      );

      if (res.status !== 200) {
        throw new Error(`OpenAI Image API error: ${res.status}`);
      }

      const b64 = res.data.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data returned');

      const thumbnailPath = path.join(
        os.tmpdir(),
        `flippi_thumb_${Date.now()}.png`,
      );
      await fs.writeFile(thumbnailPath, Buffer.from(b64, 'base64'));
      return { ok: true, thumbnailPath };
    }

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await httpPost(
        url,
        { 'Content-Type': 'application/json' },
        {
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
          },
        },
      );

      if (res.status !== 200) {
        throw new Error(`Gemini Image API error: ${res.status}`);
      }

      const parts = res.data.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: any) =>
        p.inlineData?.mimeType?.startsWith('image/'),
      );
      if (!imgPart) throw new Error('No image returned from Gemini');

      const thumbnailPath = path.join(
        os.tmpdir(),
        `flippi_thumb_${Date.now()}.png`,
      );
      await fs.writeFile(
        thumbnailPath,
        Buffer.from(imgPart.inlineData.data, 'base64'),
      );
      return { ok: true, thumbnailPath };
    }

    throw new Error(`Unknown image AI provider: ${provider}`);
  } catch (err: any) {
    log.error(`[ai] generateThumbnail failed: ${err.message}`);
    return { ok: false };
  }
}
