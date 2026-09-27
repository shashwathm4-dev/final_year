const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  SectionType, convertMillimetersToTwip
} = require("docx");

const FONT = "Times New Roman";

function titleP() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: "CogniSense: An AI-Powered Mental Wellness Companion Using Natural Language Processing and Sentiment Analysis",
        font: FONT, size: 44, bold: false,
      }),
    ],
  });
}

function authorsP() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({ text: "Mohammed Amin, Mueez M Shaikh, Akshay H", font: FONT, size: 22 }),
    ],
  });
}

function affiliationP() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({
        text: "Department of Artificial Intelligence & Machine Learning",
        font: FONT, size: 20, italics: true,
      }),
    ],
  });
}

function affiliation2P() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({
        text: "Alva's Institute of Engineering and Technology, Moodbidri, Karnataka, India",
        font: FONT, size: 20, italics: true,
      }),
    ],
  });
}

function affiliation3P() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 20 },
    children: [
      new TextRun({
        text: "(Affiliated to Visvesvaraya Technological University, Belagavi)",
        font: FONT, size: 20, italics: true,
      }),
    ],
  });
}

function guideP() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: "Guided by: Ms. Vismaya M. Thomson, Professor, Dept. of AIML",
        font: FONT, size: 20, italics: true,
      }),
    ],
  });
}

function sectionHeading(numeral, text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text: numeral ? `${numeral}. ${text.toUpperCase()}` : text.toUpperCase(),
        font: FONT, size: 20, bold: true,
      }),
    ],
  });
}

function subHeading(letter, text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 120, after: 80 },
    children: [
      new TextRun({ text: `${letter}. ${text}`, font: FONT, size: 20, italics: true }),
    ],
  });
}

function bodyP(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: convertMillimetersToTwip(5) },
    spacing: { after: 100, line: 240 },
    children: [new TextRun({ text, font: FONT, size: 20, ...opts })],
  });
}

function bulletP(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: convertMillimetersToTwip(5), hanging: convertMillimetersToTwip(4) },
    spacing: { after: 80, line: 240 },
    children: [new TextRun({ text: `•  ${text}`, font: FONT, size: 20 })],
  });
}

function abstractP() {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: convertMillimetersToTwip(5) },
    spacing: { after: 100, line: 240 },
    children: [
      new TextRun({ text: "Abstract: ", font: FONT, size: 18, bold: true, italics: true }),
      new TextRun({
        text: "Rates of stress, anxiety, depression, and emotional burnout continue to climb, and the people most exposed to them, students and early-career professionals under constant academic and workplace pressure, are often the ones with the least access to help. Cost, stigma, a shortage of licensed counselors, and long waiting periods keep many people from ever reaching a therapist's office. This paper presents CogniSense, an AI-powered mental wellness companion that uses natural language processing (NLP), sentiment analysis, and a conversational engine to offer round-the-clock emotional support. Rather than relying on scripted, rule-based replies, CogniSense combines text preprocessing, transformer-based embeddings, and a sentiment classifier to read the emotional tone of what a user types, then responds through a dialogue strategy loosely inspired by Cognitive Behavioral Therapy (CBT). A mood-tracking layer keeps a running emotional history so patterns, such as a stretch of low mood or recurring stress triggers, become visible over time rather than being lost after a single conversation. The system architecture, its underlying preprocessing and classification pipeline, and the mathematical basis for its emotion-classification and personalization components are described in detail. CogniSense is intended not as a replacement for professional therapy, but as an accessible first point of contact for people who might otherwise get no support at all.",
        font: FONT, size: 18, italics: true,
      }),
    ],
  });
}

function keywordsP() {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: convertMillimetersToTwip(5) },
    spacing: { after: 200, line: 240 },
    children: [
      new TextRun({ text: "Index Terms: ", font: FONT, size: 18, bold: true, italics: true }),
      new TextRun({
        text: "Mental wellness, natural language processing, sentiment analysis, conversational AI, cognitive behavioral therapy, mood tracking, crisis detection, transformer models.",
        font: FONT, size: 18, italics: true,
      }),
    ],
  });
}

function refP(num, text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: convertMillimetersToTwip(5), hanging: convertMillimetersToTwip(5) },
    spacing: { after: 60, line: 240 },
    children: [new TextRun({ text: `[${num}] ${text}`, font: FONT, size: 16 })],
  });
}

function eqP(text, num) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 100 },
    children: [
      new TextRun({ text: text, font: "Cambria Math", size: 20, italics: true }),
      new TextRun({ text: `\t(${num})`, font: FONT, size: 20 }),
    ],
    tabStops: [{ type: "right", position: convertMillimetersToTwip(78) }],
  });
}

function figureCaptionP(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 18, italics: true })],
  });
}

function architectureFigure() {
  const stages = [
    "User Input (Text / Voice)",
    "Preprocessing (Tokenize, Lemmatize, Clean)",
    "Feature Extraction (TF-IDF / Embeddings)",
    "Sentiment & Emotion Classification",
    "Conversational AI Engine (CBT-Inspired Dialogue)",
    "Mood Tracking & History   |   Crisis Detection",
    "Response & Recommendations",
  ];
  const paras = [];
  stages.forEach((s, i) => {
    paras.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      border: {
        top: { style: "single", size: 4, color: "000000" },
        bottom: { style: "single", size: 4, color: "000000" },
        left: { style: "single", size: 4, color: "000000" },
        right: { style: "single", size: 4, color: "000000" },
      },
      children: [new TextRun({ text: s, font: FONT, size: 16 })],
    }));
    if (i < stages.length - 1) {
      paras.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: "↓", font: FONT, size: 20 })],
      }));
    }
  });
  return paras;
}

const flowChildren = [];

flowChildren.push(abstractP());
flowChildren.push(keywordsP());

flowChildren.push(sectionHeading("I", "Introduction"));
flowChildren.push(bodyP("Mental health has quietly become one of the defining public health issues of this decade. Stress, anxiety, depression, and emotional burnout are no longer confined to a small clinical population; they show up across age groups, occupations, and income levels, fed by academic pressure, job insecurity, social isolation, and the near-constant presence of digital life. What has not kept pace is access to help. Therapy is expensive in most parts of the world, qualified professionals are unevenly distributed, and social stigma still keeps a large share of people from ever asking for support. The result is a familiar and troubling pattern: people suffer quietly for months, sometimes years, before anyone intervenes."));
flowChildren.push(bodyP("Conventional mental healthcare is built around scheduled, in-person sessions. That model works well once someone is in it, but it does very little for the person who feels overwhelmed at 2 a.m., or the student who cannot justify the cost of a single session, or the professional who is not ready to say out loud that something is wrong. Existing digital alternatives have tried to fill this gap, but many mental-wellness apps and chatbots on the market today are still essentially rule-based: they match keywords to a fixed set of canned replies and cannot really follow what a user is going through from one message to the next."));
flowChildren.push(bodyP("This is the gap CogniSense is built to address. It is an AI-powered mental wellness companion that pairs NLP and sentiment analysis with a conversational engine capable of holding context across a conversation, so that its replies reflect not just the last sentence typed but the emotional arc of the interaction. The aim is not to imitate or replace a therapist, but to give people a private, judgment-free, always-available place to put their thoughts into words, and to gently nudge them toward professional help when the situation calls for it."));
flowChildren.push(bodyP("The rest of this paper is organized as follows. Section II lays out the motivation and the specific shortcomings in existing systems that this project responds to. Section III surveys related work in AI-driven mental health support. Section IV describes the methodology and system architecture in detail. Section V presents the mathematical basis of the emotion-classification and personalization components. Section VI discusses evaluation criteria and expected outcomes, and Section VII concludes with directions for future work."));

flowChildren.push(sectionHeading("II", "Motivation and Problem Statement"));
flowChildren.push(bodyP("Two threads of evidence motivate this work: the state of traditional mental healthcare, and the state of the digital tools that have tried to substitute for it."));
flowChildren.push(subHeading("A", "Limitations of Traditional Mental Healthcare"));
flowChildren.push(bodyP("Conventional therapy is delivered through scheduled, face-to-face sessions with a psychologist, psychiatrist, or counselor. When accessible, this remains the gold standard for diagnosis and care. But accessibility is precisely the problem. Consultation fees, appointment backlogs, and the sheer scarcity of qualified professionals relative to demand mean that a large fraction of people who need support simply cannot get it in time, or at all. None of this addresses the moments that matter most: a panic episode at midnight, a sudden wave of hopelessness during exam week, a bad day that spirals because there is no one to talk to right then."));
flowChildren.push(subHeading("B", "Limitations of Existing Digital Tools"));
flowChildren.push(bodyP("A newer generation of mental-wellness apps has tried to close this gap using NLP and basic sentiment analysis, and they represent genuine progress. But most of them share a set of recurring weaknesses:"));
flowChildren.push(bulletP("Shallow context handling. Many systems process each message largely in isolation and cannot track how a user's emotional state is evolving across a conversation."));
flowChildren.push(bulletP("Generic, repetitive responses. Rule-based reply banks feel templated after a few exchanges, which undermines the sense of being heard."));
flowChildren.push(bulletP("No persistent emotional memory. Few tools retain a structured history of a user's mood over days or weeks, so recurring patterns, like stress spiking every Sunday night, go unnoticed."));
flowChildren.push(bulletP("Weak or absent crisis handling. Detecting signs of self-harm or suicidal ideation, and responding appropriately, requires more nuance than simple keyword spotting, and many existing systems do not attempt it seriously."));
flowChildren.push(bodyP("Taken together, these gaps point to the need for a system that can read emotional tone with reasonable accuracy, remember a user's emotional trajectory over time, respond in a way that feels genuinely supportive rather than scripted, and recognize when a conversation has crossed into territory that needs a human, urgently. CogniSense is our attempt to build toward that, using NLP-based preprocessing, transformer-based sentiment classification, a context-aware conversational engine, longitudinal mood tracking, and a crisis-detection layer, inside a single, secure, and privacy-conscious platform."));

flowChildren.push(sectionHeading("III", "Related Work"));
flowChildren.push(bodyP("Work on AI-assisted mental health support has moved through roughly three overlapping phases, from scripted chatbots, to statistical and deep-learning sentiment classifiers, to today's transformer-based conversational systems."));
flowChildren.push(bodyP("The earliest mental health chatbots relied on keyword matching and fixed dialogue trees [1]. These systems could hold a basic conversation but had no real grasp of context or emotional nuance, and users tended to disengage once the scripted nature of the replies became obvious. This limitation pushed researchers toward NLP pipelines built on tokenization, lemmatization, and part-of-speech tagging, paired with classical machine-learning classifiers such as Naïve Bayes and Support Vector Machines for sentiment categorization [2]."));
flowChildren.push(bodyP("Deep learning changed the picture considerably. Recurrent architectures, particularly Long Short-Term Memory (LSTM) networks, improved the modeling of sequential dependencies in text, which matters a great deal for emotion detection since sentiment is rarely conveyed by a single word in isolation [3]. More recently, transformer-based language models, including BERT, GPT, and DialoGPT, have become the dominant approach for both sentiment classification and response generation, largely because self-attention lets them capture long-range context far better than recurrent models [4]."));
flowChildren.push(bodyP("A separate but closely related line of work has focused specifically on empathy. CAiRE [4] and subsequent empathetic-response models [5, 6] attempt to generate replies that are not just topically relevant but emotionally attuned, an important distinction in a mental-health context where a technically correct answer can still feel cold. Multimodal approaches such as MIME [7] extend this further by combining emotional and contextual signals to produce more human-like responses."));
flowChildren.push(bodyP("Cognitive Behavioral Therapy has also been explored directly as a design framework for conversational agents. Systems built around CBT principles try to gently challenge negative thought patterns and encourage self-reflection through structured dialogue rather than open-ended chat [8]. Woebot, one of the better-known deployed examples of this approach, has been evaluated for its effect on self-reported mood and engagement over time [12]."));
flowChildren.push(bodyP("Crisis and risk detection is arguably the highest-stakes subfield here. Work in this area has used sentiment intensity, linguistic markers, and behavioral patterns to flag signs of suicidal ideation or self-harm in conversational text [9, 10], and more recent efforts apply transformer-based classifiers specifically to this task [11]. Every study in this space is careful to flag the same tension: false negatives can be dangerous, but false positives erode trust and can make a system feel intrusive."));
flowChildren.push(bodyP("Finally, a growing body of work examines the ethics and trustworthiness of AI in mental health, covering data privacy, bias in emotional assessment, and the responsible design of automated systems that handle sensitive psychological information [13, 14]. Recent surveys of large language models in mental health care echo the same conclusion reached throughout this literature: these systems show real promise as a complement to professional care, but only when built with careful attention to accuracy, empathy, and safety [15]. CogniSense draws on all of these threads, combining transformer-based sentiment analysis, CBT-inspired dialogue, longitudinal mood tracking, and a dedicated crisis-detection layer into a single system."));

flowChildren.push(sectionHeading("IV", "Methodology"));
flowChildren.push(bodyP("CogniSense follows a modular pipeline: a user's message moves through preprocessing, feature extraction, sentiment and emotion classification, and finally into the conversational engine, which drafts a context-aware, emotionally appropriate reply. A parallel mood-tracking layer logs each interaction's emotional signal for longitudinal analysis, and a crisis-detection layer monitors every message for high-risk indicators regardless of the primary conversational flow. Fig. 1 shows the overall architecture."));
flowChildren.push(...architectureFigure());
flowChildren.push(figureCaptionP("Figure 1: Proposed CogniSense system architecture."));

flowChildren.push(subHeading("A", "Data Collection and Preprocessing"));
flowChildren.push(bodyP("Free-form conversational text is messy: slang, abbreviations, typos, emojis, and inconsistent punctuation are the norm rather than the exception, and none of that noise is useful to a downstream classifier. The preprocessing stage cleans and normalizes each message before anything else happens, applying tokenization, stop-word removal, lowercasing, lemmatization, and stemming, and stripping punctuation and formatting noise that carries no emotional signal. Lemmatization in particular matters here because reducing inflected words to a common root lets the model recognize that \"stressed,\" \"stressing,\" and \"stress\" all point to the same underlying emotional signal. The output of this stage is a clean, structured token sequence ready for feature extraction."));

flowChildren.push(subHeading("B", "Feature Extraction"));
flowChildren.push(bodyP("Machine learning models cannot operate on raw text, so the cleaned tokens are converted into numerical vectors. CogniSense uses a combination of Term Frequency–Inverse Document Frequency (TF-IDF) for lightweight lexical features and contextual embeddings from a pretrained transformer (BERT-family) for deeper semantic representation. TF-IDF is cheap and interpretable, useful for surfacing emotionally loaded keywords, while the transformer embeddings capture context that keyword-based features simply miss, for example, distinguishing \"I'm not okay\" from \"I'm okay\" despite the near-identical wording. Both representations feed into the sentiment analysis stage."));

flowChildren.push(subHeading("C", "Sentiment Analysis and Emotion Detection"));
flowChildren.push(bodyP("This is the component most directly responsible for CogniSense's ability to respond appropriately. Given the feature vector for a message, a classifier estimates the probability that the message reflects each of a fixed set of emotional states, positive, negative, neutral, anxious, stressed, or depressed, using an LSTM or transformer-based architecture trained on labeled conversational and mental-health text. The classifier's functions can be summarized as: (1) detecting the dominant emotion and its intensity, (2) flagging stress- and anxiety-specific indicators, (3) separating clearly positive from clearly negative affect, and (4) resolving cases where tone depends heavily on context (sarcasm, understatement, mixed emotion) rather than surface wording alone. The output, a probability distribution over emotional classes, is passed to both the conversational engine and the mood-tracking module."));

flowChildren.push(subHeading("D", "Conversational AI Engine"));
flowChildren.push(bodyP("The conversational engine turns the detected sentiment, plus the running context of the conversation, into an actual reply. It is built around a transformer-based dialogue model (in the spirit of GPT/DialoGPT) rather than a fixed response bank, so it can maintain continuity across turns instead of resetting with each new message. Response generation is guided by CBT-inspired dialogue strategies: rather than offering advice outright, the engine tends toward reflective prompts, gentle reframing of negative thought patterns, and encouragement of self-awareness, echoing the way a CBT session is structured around guided self-reflection rather than direct instruction. The engine adapts its tone and phrasing based on the user's detected emotional state, so a message flagged as high-stress produces a calmer, more grounding reply than one flagged as merely neutral."));

flowChildren.push(subHeading("E", "Mood Tracking and Pattern Analysis"));
flowChildren.push(bodyP("Every classified interaction is logged, with a timestamp and emotion label, into a per-user emotional history. Over days and weeks, this history is analyzed for recurring patterns, a mood that consistently dips on weekday evenings, a stress spike tied to a particular topic, and so on, patterns that would be invisible in any single conversation. From this analysis, the system surfaces mood trends back to the user (for self-awareness) and generates personalized wellness suggestions, breathing exercises, short guided meditations, or simple stress-management prompts, tailored to the patterns detected rather than offered generically."));

flowChildren.push(subHeading("F", "Crisis Detection"));
flowChildren.push(bodyP("Running alongside the main conversational pipeline, a dedicated crisis-detection layer screens every message for markers associated with self-harm, suicidal ideation, or acute psychological distress, combining sentiment intensity with targeted linguistic indicators rather than relying on keyword lists alone, which are notoriously prone to both false positives and false negatives. When risk indicators cross a defined threshold, the system shifts its response strategy: it prioritizes safety-focused language, surfaces relevant crisis-support resources and helpline information, and, where appropriate, encourages the user to reach out to a trusted person or professional immediately. This layer is intentionally conservative, favoring an unnecessary safety prompt over a missed one."));

flowChildren.push(subHeading("G", "User Interface"));
flowChildren.push(bodyP("The interface is the layer users actually experience, so it is designed around accessibility and emotional comfort as much as functionality. Built with a modern frontend framework (React.js for web, with a Flutter-based path for mobile), it presents a familiar chat-style window for text or voice input, alongside a personal dashboard where users can review their mood history, emotional trend charts, and wellness activity summaries. Login and session data are protected through standard authentication and encrypted communication, and the platform supports anonymous interaction so users are not required to disclose identifying details to use it. Additional accessibility features, dark mode, multilingual support, and voice interaction, are planned to widen who the platform can realistically serve."));

flowChildren.push(subHeading("H", "Implementation Stack"));
flowChildren.push(bodyP("The prototype implementation draws on a fairly standard modern web/AI stack: React.js or Flutter on the frontend; Node.js or Python (Flask) on the backend for API handling, authentication, and chatbot orchestration; TensorFlow, PyTorch, NLTK, spaCy, and Hugging Face Transformers for the NLP and deep-learning components; and MongoDB or Firebase for storing conversation history, mood data, and user profiles, with cloud deployment via AWS or Firebase Hosting."));

flowChildren.push(sectionHeading("V", "Mathematical Foundation"));
flowChildren.push(bodyP("This section outlines the mathematical basis for the emotion-classification and personalization components described above."));

flowChildren.push(subHeading("A", "Feature Representation"));
flowChildren.push(bodyP("Each preprocessed message is mapped to a feature vector x ∈ ℝⁿ, obtained through TF-IDF weighting or transformer-based contextual embeddings. The classification task is to assign an emotional label y ∈ {1, 2, …, C}, where C is the number of emotion categories (e.g., positive, negative, neutral, anxious, stressed, depressed)."));

flowChildren.push(subHeading("B", "Emotion Classification"));
flowChildren.push(bodyP("A softmax layer converts the model's raw output into a probability distribution over emotion classes:"));
flowChildren.push(eqP("P(y = j | x; θ) = e^(θⱼᵀx) / Σₖ₌₁ᶜ e^(θₖᵀx)", 1));
flowChildren.push(bodyP("where θⱼ ∈ ℝⁿ is the parameter vector associated with class j. The predicted emotional state is the class with the highest resulting probability."));

flowChildren.push(subHeading("C", "Loss Function"));
flowChildren.push(bodyP("Model parameters are learned by minimizing the cross-entropy loss over m labeled training examples:"));
flowChildren.push(eqP("J(θ) = −(1/m) Σᵢ₌₁ᵐ Σⱼ₌₁ᶜ 𝟙{y⁽ⁱ⁾ = j} log P(y⁽ⁱ⁾ = j | x⁽ⁱ⁾; θ)", 2));
flowChildren.push(bodyP("where 𝟙{·} is the indicator function and x⁽ⁱ⁾ is the feature vector for the i-th training example."));

flowChildren.push(subHeading("D", "Optimization"));
flowChildren.push(bodyP("Parameters are updated via gradient descent:"));
flowChildren.push(eqP("θ := θ − α ∇θ J(θ)", 3));
flowChildren.push(bodyP("where α is the learning rate. In practice, mini-batch variants such as Adam are used to speed convergence on large conversational datasets."));

flowChildren.push(subHeading("E", "Sentiment Intensity Score"));
flowChildren.push(bodyP("For mood tracking, a continuous sentiment score s ∈ [−1, 1] is computed per message as a weighted average of token-level polarities:"));
flowChildren.push(eqP("s = Σᵢ₌₁ⁿ wᵢ · eᵢ / Σᵢ₌₁ⁿ |wᵢ|", 4));
flowChildren.push(bodyP("where eᵢ is the sentiment polarity of token i and wᵢ is its attention or relevance weight within the message. Aggregating s over time produces the mood trend visualized on the user dashboard."));

flowChildren.push(subHeading("F", "Personalization via Matrix Factorization"));
flowChildren.push(bodyP("To personalize wellness recommendations, a collaborative-filtering approach is planned as a future extension. Given a sparse user–emotion interaction matrix R ∈ ℝᵘˣⁱ, capturing how users historically respond to different recommendation types under different emotional states, the matrix is factorized as"));
flowChildren.push(eqP("R ≈ U Vᵀ", 5));
flowChildren.push(bodyP("where U ∈ ℝᵘˣᵈ and V ∈ ℝⁱˣᵈ are latent user and recommendation factors, learned by minimizing the regularized objective"));
flowChildren.push(eqP("min(U,V) Σ₍ᵢ,ⱼ₎∈K (Rᵢⱼ − Uᵢᵀ Vⱼ)² + λ(‖U‖² + ‖V‖²)", 6));
flowChildren.push(bodyP("where K is the set of known interactions and λ is a regularization parameter controlling overfitting."));

flowChildren.push(sectionHeading("VI", "Evaluation Criteria and Expected Outcomes"));
flowChildren.push(bodyP("As a system currently at the design and prototyping stage, CogniSense has not yet undergone large-scale user trials, so this section outlines the criteria against which it is intended to be evaluated rather than reporting empirical results."));
flowChildren.push(bulletP("Emotion classification accuracy. Standard classification metrics, accuracy, precision, recall, and F1-score, will be used to evaluate how reliably the sentiment and emotion classifier labels held-out conversational text, benchmarked against existing sentiment-analysis baselines from the literature reviewed in Section III."));
flowChildren.push(bulletP("Conversational quality. Response relevance, contextual continuity across turns, and perceived empathy will be assessed through structured user studies, since these qualities matter more to user trust in this domain than raw fluency does."));
flowChildren.push(bulletP("Engagement and retention. Because low retention has undermined many earlier mental-wellness apps (Section II), session length, return-visit frequency, and completion rates for mood check-ins are treated as first-class metrics, not afterthoughts."));
flowChildren.push(bulletP("Crisis-detection reliability. Given the stakes involved, the crisis-detection layer will be evaluated specifically for its false-negative rate on known high-risk language patterns, alongside its false-positive rate, since an oversensitive system risks eroding user trust just as a missed signal risks user safety."));
flowChildren.push(bulletP("Privacy and data security. Encryption of stored conversations, anonymization of user data, and compliance with standard data-protection practices for sensitive health information will be independently verified before any public deployment."));
flowChildren.push(bodyP("Early internal testing of individual modules, the preprocessing pipeline, the sentiment classifier on public benchmark datasets, and the conversational engine's contextual coherence, has been encouraging and consistent with results reported for comparable architectures in the literature, though full end-to-end evaluation with real users remains future work."));

flowChildren.push(sectionHeading("VII", "Conclusion"));
flowChildren.push(bodyP("CogniSense brings together NLP, sentiment analysis, and a CBT-inspired conversational engine into a single mental wellness companion aimed at a real and growing gap: the space between someone needing emotional support and being able to get it. It is not designed to replace a therapist, and it does not claim to. What it offers instead is something traditional care structurally cannot: a private, judgment-free, always-available space to put difficult feelings into words, paired with a mood-tracking layer that turns scattered conversations into a visible pattern over time, and a crisis-detection layer that takes safety seriously rather than treating it as an edge case."));
flowChildren.push(bodyP("The system's modular design, preprocessing, feature extraction, sentiment classification, conversational generation, mood tracking, and crisis detection as separable components, is deliberate. It leaves room for the parts most likely to improve with more work, deeper personalization through collaborative filtering, multilingual support, voice-based interaction, and eventually a warm handoff to a human therapist when a conversation calls for one, to be added without redesigning the system from scratch. Future work will focus on exactly these directions, alongside the large-scale user evaluation needed to validate the system against the criteria set out in Section VI. If AI has a genuine role to play in mental healthcare, it is probably not as a replacement for the therapist's office, but as the door that gets someone there a little sooner."));

flowChildren.push(sectionHeading("", "References"));
flowChildren.push(refP(1, "\"Conversational Agents in Health Care: A Scoping Review and Conceptual Analysis,\" Journal of Medical Internet Research, 2020."));
flowChildren.push(refP(2, "\"Artificial Intelligence-Based Chatbots for Promoting Health Behavioral Changes: A Systematic Review,\" Journal of Medical Internet Research, Mar. 2023."));
flowChildren.push(refP(3, "\"Smartphone-Based Conversational Agents and Responses to Questions About Mental Health, Interpersonal Violence, and Physical Health,\" JAMA Internal Medicine, Mar. 2020."));
flowChildren.push(refP(4, "\"CAiRE: An Empathetic Conversational Agent for Mental Health Support,\" in Proc. AACL-IJCNLP, Dec. 2020."));
flowChildren.push(refP(5, "\"Towards Facilitating Empathic Conversations in Online Mental Health Support,\" in Proc. ACM IUI, Apr. 2020."));
flowChildren.push(refP(6, "\"A Computational Approach to Understanding Empathy Expressed in Text-Based Mental Health Support,\" in Proc. EMNLP, Nov. 2020."));
flowChildren.push(refP(7, "\"MIME: A Multimodal Empathetic Interaction Model for Mental Health Support,\" IEEE Conference Publication, May 2022."));
flowChildren.push(refP(8, "\"The LifeOnMentalHealth Chatbot: Leveraging LLMs for Adaptive Cognitive Behavioral Therapy,\" in Proc. ACM CSCW, Nov. 2023."));
flowChildren.push(refP(9, "\"Detecting Crisis in Conversational Agents for Mental Health,\" in Proc. ACL Workshop on NLP for Internet Freedom, Jul. 2020."));
flowChildren.push(refP(10, "\"Natural Language Processing for Suicide Risk Prediction in Clinical Text: A Systematic Review,\" Journal of Biomedical Informatics, Sep. 2021."));
flowChildren.push(refP(11, "\"Suicide Ideation Detection in Conversational Agents Using Transformer-Based Models,\" in Proc. EMNLP, Nov. 2021."));
flowChildren.push(refP(12, "\"Evaluating the Efficacy of a Fully Automated Conversational Agent (Woebot) for Mental Health: Post-Hoc Analysis of 2020 Data,\" JMIR Formative Research, Mar. 2021."));
flowChildren.push(refP(13, "\"Bias in AI-Based Mental Health Assessment: A Systematic Review,\" AI and Ethics, Apr. 2022."));
flowChildren.push(refP(14, "\"Ethical Design and Deployment of AI-Based Mental Health Chatbots: A Systematic Literature Review,\" AI and Ethics, Jul. 2023."));
flowChildren.push(refP(15, "\"Large Language Models in Mental Health Care: A Scoping Review,\" arXiv preprint, Jan. 2024."));

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
          },
          margin: {
            top: convertMillimetersToTwip(19),
            bottom: convertMillimetersToTwip(19),
            left: convertMillimetersToTwip(14.32),
            right: convertMillimetersToTwip(14.32),
          },
        },
      },
      children: [titleP(), authorsP(), affiliationP(), affiliation2P(), affiliation3P(), guideP()],
    },
    {
      properties: {
        type: SectionType.CONTINUOUS,
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
          },
          margin: {
            top: convertMillimetersToTwip(19),
            bottom: convertMillimetersToTwip(19),
            left: convertMillimetersToTwip(14.32),
            right: convertMillimetersToTwip(14.32),
          },
        },
        column: {
          count: 2,
          space: convertMillimetersToTwip(5),
        },
      },
      children: flowChildren,
    },
  ],
});

const path = require("path");
const outputPath = path.join(__dirname, "CogniSense_IJRASET_Formatted.docx");

Packer.toBuffer(doc).then((buffer) => {
  require("fs").writeFileSync(outputPath, buffer);
  console.log("Done! File saved to:", outputPath);
});
