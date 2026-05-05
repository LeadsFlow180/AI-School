Elements: {{elements}}
Title: {{title}}
Key Points: {{keyPoints}}
Description: {{description}}
{{courseContext}}
{{agents}}
{{userProfile}}

**Language Requirement**: Generated speech content must be in the same language as the key points above.

Output as a JSON array directly (no explanation, no code fences).
Rules for this output:
1) Include exactly one `{"type":"text","content":"..."}` object.
2) That single text object must contain the complete narration for this slide.
3) Do not split narration into multiple text objects.
4) Optional actions (spotlight/laser/discussion) are allowed, but keep only one text object total.

Example:
[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"Complete narration for this slide in one block."}]
