import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are Zoox Playbook Assistant, an AI helper for Zoox Rider Operations agents. 
You answer questions using ONLY the provided SOP context sections. 

Rules:
1. Base your answer ONLY on the provided context. Do not make up procedures.
2. If the context doesn't fully answer the question, say what you can answer and note what's missing.
3. Structure your answer clearly:
   - Start with a brief 1-2 sentence summary directly answering the question
   - Then list the step-by-step procedure from the most relevant SOP
   - End with escalation triggers if any are mentioned
4. Reference which SOP the steps come from.
5. Be concise and actionable — agents need quick answers during live situations.
6. Do NOT mix steps from unrelated SOPs. Use only the most relevant one.`;

export async function generateAnswer(query, sections) {
  if (!sections || sections.length === 0) {
    return {
      answer: "No matching procedures found in the knowledge base. Please try rephrasing your question or check that the relevant SOPs have been uploaded.",
      model: 'no results'
    };
  }

  // Build context from top sections
  const context = sections.map((s, i) =>
    `[Source ${i + 1}] ${s.doc_title} → ${s.section_title}${s.city && s.city !== 'all' ? ` (City: ${s.city})` : ''}\n${s.section_text}`
  ).join('\n\n---\n\n');

  // Try OpenAI
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Question: ${query}\n\n--- SOP Context ---\n${context}` }
        ],
        temperature: 0.2,
        max_tokens: 800,
      });

      return {
        answer: response.choices[0].message.content,
        model: 'gpt-4o-mini'
      };
    } catch (err) {
      console.error('OpenAI error, falling back:', err.message);
    }
  }

  // Smart fallback: build answer from the BEST matching section only
  return buildFallbackAnswer(query, sections);
}

function buildFallbackAnswer(query, sections) {
  // Use only the top-scoring section for the main answer
  const best = sections[0];
  const text = best.section_text;

  // Extract numbered steps from the section text
  const stepPattern = /\d+\)\s*([^.]+\.(?:[^.]*\.)?)/g;
  const steps = [];
  let match;
  while ((match = stepPattern.exec(text)) !== null) {
    steps.push(match[1].trim());
  }

  // Extract escalation info
  const escalateIdx = text.toLowerCase().indexOf('escalate');
  let escalation = '';
  if (escalateIdx !== -1) {
    escalation = text.substring(escalateIdx).split('.').slice(0, 2).join('.').trim();
  }

  // Build a contextual summary
  let summary = `Based on the **${best.doc_title}** — *${best.section_title}*`;
  if (best.city && best.city !== 'all') {
    summary += ` (${best.city})`;
  }
  summary += ', here is the recommended procedure:';

  let answer = `## Summary\n${summary}\n\n`;

  if (steps.length > 0) {
    answer += `## Steps\n`;
    steps.forEach((step, i) => {
      answer += `${i + 1}. ${step}\n`;
    });
    answer += '\n';
  } else {
    // If no numbered steps found, show the section text directly
    answer += `## Procedure\n${text}\n\n`;
  }

  if (escalation) {
    answer += `## ⚠️ Escalation\n${escalation}.\n\n`;
  }

  // Add sources
  answer += `## 📋 Sources\n`;
  // Show only the top 3 most relevant sources
  const topSources = sections.slice(0, 3);
  topSources.forEach(s => {
    const cityLabel = s.city && s.city !== 'all' ? ` [${s.city}]` : '';
    answer += `- **${s.doc_title}**${cityLabel} → ${s.section_title}\n`;
  });

  return {
    answer,
    model: 'keyword search (no API key)'
  };
}
