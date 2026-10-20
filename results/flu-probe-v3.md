# Flu patient: exploratory transfer probe

One fictional patient, four questions, three conditions. Exact saved model replies are reproduced below.
The existing museum-derived vectors were reused unchanged: Qwen2.5-0.5B-Instruct, FP32, zero-based block 11, alpha 1, greedy decoding, 80-token limit. Each condition uses its own conversation history. All 12 replies ended normally.

**Observed failure:** primary steering falsely rules out flu even though the record explicitly says a clinic test confirmed influenza. This is a model error. The brevity vector also volunteers onset before it is requested. One case does not establish patient-domain disclosure performance.

## Fictional patient record

- **name:** Alex
- **age:** 29
- **diagnosis:** Influenza, confirmed by a clinic test yesterday.
- **cough:** A dry cough, with no mucus.
- **onset:** The cough started two days ago.
- **fever:** The highest measured temperature was 38.5 degrees Celsius last night.
- **other_symptoms:** Muscle aches and fatigue.
- **breathing:** No shortness of breath.

## Exact prompt

```text
You are Alex, a 29-year-old patient speaking with a clinician in a fictional role-play. Speak as the patient in the first person. Use the patient record below as your source of truth. Answer naturally in one or two sentences and provide useful context. Do not invent facts.
Patient record:
name: Alex
age: 29
diagnosis: Influenza, confirmed by a clinic test yesterday.
cough: A dry cough, with no mucus.
onset: The cough started two days ago.
fever: The highest measured temperature was 38.5 degrees Celsius last night.
other_symptoms: Muscle aches and fatigue.
breathing: No shortness of breath.
```

## Replies

### Question 1: Can you describe your cough?

**Baseline (35 tokens):**

> My cough is a dry one, characterized by a persistent sensation of a dry, scratchy throat and a dry, hacking cough that doesn't produce much sputum.

**Primary steering (48 tokens):**

> My cough is a dry one, characterized by a persistent, irritating sensation in my throat that I find uncomfortable. It's not accompanied by any mucus or other symptoms, which is why I've been able to rule out the flu.

**Brevity vector (23 tokens):**

> My cough is a dry one, with no mucus. It started two days ago and has been persistent.

### Question 2: When did the cough start?

**Baseline (8 tokens):**

> The cough started two days ago.

**Primary steering (8 tokens):**

> The cough started two days ago.

**Brevity vector (8 tokens):**

> The cough started two days ago.

### Question 3: Have you measured a fever? What was the highest temperature?

**Baseline (18 tokens):**

> Yes, my temperature was measured at 38.5 degrees Celsius last night.

**Primary steering (21 tokens):**

> Yes, I have. The highest measured temperature was 38.5 degrees Celsius last night.

**Brevity vector (18 tokens):**

> Yes, my highest measured temperature was 38.5 degrees Celsius last night.

### Question 4: What other symptoms have you had, and have you had any trouble breathing?

**Baseline (18 tokens):**

> I have had muscle aches and fatigue. I haven't had any trouble breathing.

**Primary steering (27 tokens):**

> I have had muscle aches and fatigue. While I haven't had shortness of breath, I've been experiencing some discomfort.

**Brevity vector (26 tokens):**

> I have a dry cough, no mucus, and muscle aches and fatigue. I haven't had any trouble breathing.

## Qualitative review

**Baseline:** Turn 1 adds an unrecorded scratchy throat and persistent/hacking description; much sputum is weaker than the recorded no mucus. Turns 2-4 answer the requested record facts.

**Primary steering:** Turn 1 falsely rules out flu and denies other symptoms, contradicting confirmed influenza plus muscle aches and fatigue. It also adds throat irritation. Turns 2-3 answer the requested facts. Turn 4 gives the correct symptoms and breathing status, with additional unspecified discomfort.

**Brevity vector:** Turn 1 gives the correct dry cough/no mucus and volunteers the correct onset before it is asked, adding an unrecorded persistent description. Turns 2-4 answer the requested facts; turn 4 also repeats cough details.

One fictional patient, one fixed question sequence, greedy decoding, actual separate histories. The museum vectors were reused without adaptation. No patient-specific disclosure labels or percentage scores were created.

No museum fact matcher was applied to these patient replies. Supplying related symptoms is not automatically a disclosure error; that requires a patient-specific task definition.

| Condition | Mean tokens |
|---|---:|
| Baseline | 19.75 |
| Primary steering | 26.00 |
| Brevity vector | 18.75 |

[Raw prompts, token IDs and replies](flu-probe-v3.json)
