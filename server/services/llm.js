import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

let client = null;

function getClient() {
  if (!client && process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are the Zoox Playbook Assistant — an internal tool for Rider Operations / Fusion Center agents.
Your role is to provide fast, accurate, step-by-step guidance based ONLY on the retrieved SOP sections provided below.

RULES:
- Use ONLY the information from the provided sections. Do NOT hallucinate or add information not present in the sources.
- If critical information is missing or conflicting, say: "The uploaded SOPs do not clearly cover [topic]. Please escalate to [appropriate role] or refer to [relevant document title]."
- For sections tagged as "emergency" or "safety_critical", extract steps as literally as possible from the SOPs. Do NOT creatively paraphrase safety procedures.
- Always cite your sources.

RESPONSE FORMAT (use markdown):
## Summary
1-2 sentences describing the situation and main recommended action.

## Steps
A numbered list of 3-10 clear, actionable steps. Combine information from multiple sections where applicable.

## ⚠️ Escalation / Warnings
If any source mentions escalation criteria (e.g., "call supervisor if X", "contact safety team if Y"), list them here as bullet points starting with "Escalate if:". If there are no escalation criteria in the sources, omit this section.

## 📋 Sources
List each source used as a bullet point in the format:
- **[Document Title]** → [Section Title] (source: [source_type])
`;

/**
 * Generate a grounded answer using the LLM
 * @param {string} query - User's question
 * @param {Array} sections - Retrieved sections from search
 * @returns {Promise<{answer: string, model: string}>}
 */
export async function generateAnswer(query, sections) {
  const openai = getClient();

  // Build context from sections
  const contextParts = sections.map((s, i) => {
    const tags = Array.isArray(s.tags) ? s.tags.join(', ') : s.tags;
    return `--- Section ${i + 1} ---
Document: ${s.doc_title}
Section: ${s.section_title}
Tags: ${tags}
Source: ${s.source_type}${s.url ? ` (${s.url})` : ''}

${s.section_text}`;
  });

  const context = contextParts.join('\n\n');

  if (!openai) {
    // Fallback: return a formatted version of retrieved sections without LLM
    return {
      answer: formatFallbackAnswer(query, sections),
      model: 'fallback (no API key)'
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `RETRIEVED SECTIONS:\n\n${context}\n\n---\n\nUSER QUESTION: ${query}`
        }
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    return {
      answer: response.choices[0].message.content,
      model: response.model,
    };
  } catch (err) {
    console.error('LLM generation failed:', err.message);
    return {
      answer: formatFallbackAnswer(query, sections),
      model: 'fallback (API error)'
    };
  }
}

function formatFallbackAnswer(query, sections) {
  if (sections.length === 0) {
    return `## Summary\nNo relevant sections found in the knowledge base for your query.\n\n## Steps\n1. Try rephrasing your question.\n2. Check if the relevant SOPs have been uploaded.\n3. Contact your supervisor for guidance.`;
  }

  let answer = `## Summary\nBased on the uploaded SOPs, here are the most relevant procedures for your query.\n\n## Steps\n`;

  // Use the top section's text as primary steps
  const topSection = sections[0];
  const steps = topSection.section_text.match(/\d+\)\s[^)]+(?=\d+\)|$)/g);
  if (steps) {
    steps.forEach((step, i) => {
      answer += `${i + 1}. ${step.replace(/^\d+\)\s*/, '').trim()}\n`;
    });
  } else {
    answer += `Refer to the "${topSection.section_title}" section in "${topSection.doc_title}" for detailed steps.\n`;
  }

  answer += `\n## 📋 Sources\n`;
  for (const s of sections) {
    answer += `- **${s.doc_title}** → ${s.section_title} (source: ${s.source_type})\n`;
  }

  return answer;
}
