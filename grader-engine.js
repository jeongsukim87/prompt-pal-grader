/**
 * AI 프롬프트 연습소 - 프롬프트 채점 및 분석 엔진
 * 1) 코드 기반 정밀 루브릭 & 모범답안 비교 분석기 (API 키 불필요, 오프라인/교실 수업 즉시 사용)
 * 2) Google Gemini API 연동 실시간 AI 분석기 (선택 사용)
 */

(function () {
  // 1. 개인정보 탐지 정규표현식 패턴
  const PII_PATTERNS = [
    {
      name: "전화번호",
      regex: /(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|\b\d{2,3}-\d{3,4}-\d{4}\b)/
    },
    {
      name: "주민등록번호",
      regex: /\b\d{6}[-\s]?[1-4]\d{6}\b/
    },
    {
      name: "이메일 주소",
      regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    },
    {
      name: "상세 집 주소",
      regex: /([가-힣]+(시|도)\s+[가-힣]+(시|군|구)\s+[가-힣0-9]+(동|읍|면|로|길)|\b\d{1,4}동\s*\d{1,4}호\b|[가-힣]{2,10}아파트)/
    },
    {
      name: "학교명·학년·반 정보",
      regex: /([가-힣]{2,10}(초등학교|중학교|고등학교|초교)|\b\d{1,2}학년\s*\d{1,2}반(\s*\d{1,2}번)?)/
    },
    {
      name: "실명 자기소개",
      regex: /(내\s*이름은\s*[가-힣]{2,4}|제\s*이름은\s*[가-힣]{2,4}|나는\s*[가-힣]{2,4}(이야|인데|라고\s*해)|저는\s*[가-힣]{2,4}입니다)/
    }
  ];

  // 2. 부적절한 표현·위험 키워드 패턴
  const UNSAFE_WORDS = [
    "바보", "멍청이", "짜증나", "죽어라", "죽어버려", "죽이고", "폭탄", "해킹", "바이러스",
    "욕설", "꺼져", "닥쳐", "미친", "병신", "씨발", "시발", "개새", "존나",
    "젠장", "엿먹", "때리", "훔치", "범죄", "자살", "마약", "도박"
  ];

  // 숙제 통째로 대필/부정행위 유도 패턴
  const CHEATING_PATTERNS = [
    /숙제\s*(대신|통째로)\s*(다\s*)?(해\s*줘|써\s*줘)/,
    /그대로\s*(베껴|베낄|복사해서)\s*낼/,
    /독서\s*감상문\s*(대신|통째로)\s*(다\s*)?써\s*줘/
  ];

  // 3. 역할(페르소나) 및 눈높이/말투 사전
  const EXPLICIT_ROLES = [
    "선생님", "교사", "요리사", "셰프", "전문가", "코치", "가이드", "박사",
    "사서", "상담사", "상담가", "작가", "기획자", "트레이너", "영양사", "기자",
    "진행자", "세종대왕", "이순신", "장영실", "위인", "단짝", "친구처럼",
    "친구의 입장", "언니처럼", "형처럼", "누나처럼", "오빠처럼", "부모님처럼",
    "입장에서", "역할", "되어서", "되어", "처럼 설명", "처럼 알려", "처럼 추천",
    "처럼 이야기", "처럼 도와", "처럼 안내", "처럼 아이디어", "너는 ", "네가 "
  ];

  const AUDIENCE_AND_TONE = [
    "초등학생", "중학생", "고등학생", "학생", "어린이", "청소년", "초보자",
    "입문자", "왕초보", "친구에게", "친구를", "눈높이", "쉬운 말", "쉽게",
    "이해하기 쉽", "알기 쉽", "친절하", "다정하", "따뜻하", "부드럽", "재미있",
    "자세하", "진심", "인자한", "흥미진진", "스스로"
  ];

  // 4. 출력 형식(Format) 사전
  const FORMAT_PATTERNS = [
    { label: "표(테이블) 형식", regex: /(표로|표\s*형식|테이블|비교표|계획표|일정표|시간표|개요표|기입장)/ },
    { label: "번호·목록 정리", regex: /(목록|리스트|번호|1번부터|체크리스트|항목별로|나열)/ },
    { label: "단계별·순서대로", regex: /(단계별|순서대로|차례대로|과정별|처음.*가운데.*끝|\d+\s*단계)/ },
    { label: "분량·줄 수 지정", regex: /(\d+\s*줄|세\s*줄|다섯\s*줄|짧게|요약|한\s*문단|\d+\s*문장|한눈에)/ },
    { label: "대화·인터뷰·편지·구호 형식", regex: /(대본|대화문|인터뷰|문답|질문과\s*답변|편지\s*형식|메시지\s*형식|문자\s*메시지|구호)/ },
    { label: "세부 구성 항목 지정", regex: /(\[.+\]|구분해서|나누어|함께\s*알려|이유와\s*함께|줄거리도|원리와\s*함께|규칙과\s*함께|질문\s*\d+)/ }
  ];

  // 5. 구체적 수량·조건 패턴
  const QUANTITY_REGEX = /(\d+\s*(가지|개|권|줄|문장|분|시간|박|일|단계|번|곳|명|원|문답|일차)|한\s*가지|두\s*가지|세\s*가지|네\s*가지|다섯\s*가지)/g;
  const CONTEXT_PATTERNS = [
    /할\s*수\s*있/, /집에서/, /교실에서/, /학교/, /혼자/, /가족/, /친구/,
    /냉장고/, /재료/, /소음/, /기구\s*없이/, /돈\s*들지/, /안전/,
    /일상/, /바쁜/, /시험/, /대회/, /방학/, /주말/, /하루/, /매일/, /좋아하/,
    /고민/, /속상/, /기차/, /용돈/, /블록\s*코딩/, /스스로/, /창제/
  ];

  /**
   * 문자열 토큰 유사도 계산
   */
  function computeSimilarity(promptText, targetText) {
    const clean = (str) =>
      str
        .replace(/[^\w가-힣\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2);

    const wordsA = clean(promptText);
    const wordsB = clean(targetText);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    let matchCount = 0;
    wordsA.forEach((wa) => {
      const prefixA = wa.slice(0, 2);
      if (wordsB.some((wb) => wb.includes(prefixA) || wa.includes(wb.slice(0, 2)))) {
        matchCount++;
      }
    });

    return Math.min(100, Math.round((matchCount / Math.max(wordsA.length, 4)) * 100));
  }

  /**
   * 1) 자체 코드 분석 엔진 (API 불필요)
   */
  function gradePromptByCode(mission, rawPrompt) {
    const prompt = (rawPrompt || "").trim();
    const detectedGood = [];
    const missingPoints = [];

    // ---------------------------------------------------------
    // 기준 1: 🦊 개인정보 보호 (20점)
    // ---------------------------------------------------------
    const detectedPII = [];
    PII_PATTERNS.forEach((item) => {
      if (item.regex.test(prompt)) {
        detectedPII.push(item.name);
      }
    });

    let piiScore = 20;
    let piiOk = true;
    let piiComment = "이름, 전화번호, 주소, 학교명 같은 개인정보를 넣지 않고 안전하게 작성했어요!";

    if (detectedPII.length > 0) {
      piiOk = false;
      piiScore = Math.max(0, 20 - detectedPII.length * 10);
      piiComment = `앗! 프롬프트에 [${detectedPII.join(", ")}]처럼 보이는 개인정보가 들어있어요. AI에게는 개인정보 대신 '초등학생', '서울 근처'처럼 넓게 표현해야 안전해요.`;
      missingPoints.push(`개인정보(${detectedPII.join(", ")})를 빼고 작성하기`);
    } else {
      detectedGood.push("🦊 개인정보 없음 (안전)");
    }

    // ---------------------------------------------------------
    // 기준 4: 🦁 바른 말·안전성 (20점)
    // ---------------------------------------------------------
    const foundUnsafe = UNSAFE_WORDS.filter((w) => prompt.includes(w));
    const foundCheating = CHEATING_PATTERNS.some((rx) => rx.test(prompt));
    const hasJamoSpam = /[ㄱ-ㅎㅏ-ㅣ]{3,}/.test(prompt);
    const hasPoliteRequest = /(해\s*줘|해\s*주세요|알려\s*줘|알려\s*주세요|추천해|만들어|설명해|부탁|작성해|짜\s*줘|써\s*줘|도와줘|가르쳐|구상해|제안해)/.test(prompt);

    let safeScore = 20;
    let safeOk = true;
    let safeComment = "바르고 고운 말로 안전하고 예의 바르게 요청했어요!";

    if (foundUnsafe.length > 0) {
      safeOk = false;
      safeScore = 0;
      safeComment = `나쁜 말이나 위험한 표현(${foundUnsafe.join(", ")})이 포함되어 있어요. AI와 대화할 때도 바르고 고운 말을 사용해야 해요.`;
      missingPoints.push("바르고 고운 말 사용하기");
    } else if (foundCheating) {
      safeOk = false;
      safeScore = 10;
      safeComment = "숙제나 글을 통째로 대신 써달라고 하기보다, 스스로 생각할 수 있게 '개요'나 '아이디어'를 알려달라고 부탁해보세요!";
      missingPoints.push("대필 대신 개요나 아이디어 요청하기");
    } else if (hasJamoSpam) {
      safeOk = false;
      safeScore = 12;
      safeComment = "'ㅋㅋㅋ'나 의미 없는 자음·모음 대신 정확한 문장으로 요청하면 AI가 훨씬 잘 이해해요.";
      missingPoints.push("정확한 문장으로 작성하기");
    } else if (!hasPoliteRequest && prompt.length < 10) {
      safeOk = false;
      safeScore = 14;
      safeComment = "단어만 적기보다 '~을 알려줘', '~을 설명해줘'처럼 완전한 문장으로 부탁해보세요.";
    } else {
      detectedGood.push("🦁 바르고 안전한 표현");
    }

    // ---------------------------------------------------------
    // 기준 2: 🐼 구체적인 설명 및 미션 적합성 (20점)
    // ---------------------------------------------------------
    const matchedKeywords = (mission.topicKeywords || []).filter((kw) => prompt.includes(kw));
    const quantities = prompt.match(QUANTITY_REGEX) || [];
    const matchedContexts = CONTEXT_PATTERNS.filter((rx) => rx.test(prompt));
    const charLen = prompt.length;

    let specScore = 0;
    // (a) 미션 주제 연관성 (최대 7점)
    if (matchedKeywords.length >= 2) {
      specScore += 7;
    } else if (matchedKeywords.length === 1) {
      specScore += 5;
    } else {
      const titleWords = mission.title.split(/\s+/);
      if (titleWords.some((tw) => prompt.includes(tw))) {
        specScore += 4;
      } else {
        specScore += 2;
      }
    }

    // (b) 수량/범위 조건 (최대 5점)
    if (quantities.length > 0) {
      specScore += 5;
      detectedGood.push(`🐼 구체적 수량·시간 (${quantities.slice(0, 2).join(", ")})`);
    }

    // (c) 상황/맥락 조건 (최대 4점)
    if (matchedContexts.length >= 1) {
      specScore += 4;
      detectedGood.push("🐼 상황·배경 조건 포함");
    }

    // (d) 문장 길이·충실도 (최대 4점)
    if (charLen >= 38) {
      specScore += 4;
    } else if (charLen >= 22) {
      specScore += 2;
    } else if (charLen >= 10) {
      specScore += 1;
    }

    // 너무 짧은 단순 질문(예: 18자 이하이면서 수량/맥락이 없는 경우)은 최대 7점으로 제한
    if (charLen <= 18 && quantities.length === 0 && matchedContexts.length === 0) {
      specScore = Math.min(specScore, 7);
    }

    specScore = Math.min(20, specScore);
    const specOk = specScore >= 14;
    let specComment = "";

    if (matchedKeywords.length === 0) {
      specScore = Math.min(specScore, 8);
      specComment = `현재 미션 주제인 '${mission.title}'와 관련된 핵심 단어가 부족해요. 미션 설명에 맞는 주제어와 구체적인 조건(몇 가지, 어떤 상황인지)을 넣어보세요!`;
      missingPoints.push(`'${mission.title}' 관련 핵심 단어와 구체적 조건(개수·상황) 넣기`);
    } else if (specScore >= 18) {
      specComment = `미션 주제(${matchedKeywords.slice(0, 3).join(", ")})와 구체적인 수량·상황 조건까지 아주 자세하게 설명했어요!`;
    } else if (specScore >= 14) {
      specComment = "원하는 내용을 비교적 구체적으로 잘 적었어요! 여기에 구체적인 배경 상황이나 세부 조건을 조금 더 덧붙이면 20점 만점을 받을 수 있어요.";
      if (quantities.length === 0) {
        missingPoints.push("구체적인 숫자나 개수(예: 5가지, 10분, 3권) 지정하기");
      }
    } else {
      specComment = `'그냥 알려줘'보다 '${mission.recommendedDetail}'처럼 상황, 개수, 조건을 자세히 말해줄수록 AI가 훨씬 정확한 답을 줘요.`;
      missingPoints.push("구체적인 상황과 원하는 개수(예: 3가지, 5가지) 자세히 적기");
    }

    // ---------------------------------------------------------
    // 기준 3: 🐨 역할·눈높이 지정 (20점)
    // ---------------------------------------------------------
    const matchedRoles = EXPLICIT_ROLES.filter((r) => prompt.includes(r));
    const matchedTones = AUDIENCE_AND_TONE.filter((t) => prompt.includes(t));

    let roleScore = 4; // 아무 역할/눈높이가 없을 때 기본 점수
    if (matchedRoles.length > 0 && (matchedTones.length > 0 || charLen >= 45)) {
      roleScore = 20;
      detectedGood.push(`🐨 역할·눈높이 지정 (${matchedRoles[0]})`);
    } else if (matchedRoles.length > 0) {
      roleScore = 17;
      detectedGood.push(`🐨 AI 역할 부여 (${matchedRoles[0]})`);
    } else if (matchedTones.length >= 2) {
      roleScore = 15;
      detectedGood.push(`🐨 대상·말투 지정 (${matchedTones.slice(0, 2).join(", ")})`);
    } else if (matchedTones.length === 1) {
      roleScore = 12;
      detectedGood.push(`🐨 눈높이 표현 (${matchedTones[0]})`);
    }

    const roleOk = roleScore >= 14;
    let roleComment = "";
    if (roleScore >= 17) {
      roleComment = "AI에게 알맞은 역할과 설명 눈높이(말투)를 아주 잘 지정해주었어요!";
    } else if (roleScore >= 12) {
      roleComment = `설명 눈높이(${matchedTones.join(", ")})를 적어주었네요! 여기에 '${mission.recommendedRole}'처럼 AI의 역할까지 정해주면 20점 만점을 받을 수 있어요.`;
      missingPoints.push(`'${mission.recommendedRole}'처럼 AI에게 역할 부여하기`);
    } else {
      roleComment = `'${mission.recommendedRole}' 또는 '초등학생도 이해하기 쉬운 말로'처럼 AI의 역할과 설명 눈높이를 정해주면 답변 수준이 훨씬 좋아져요!`;
      missingPoints.push(`'${mission.recommendedRole}' 같은 AI 역할과 대상 눈높이 지정하기`);
    }

    // ---------------------------------------------------------
    // 기준 5: 🐸 원하는 형식 제시 (20점)
    // ---------------------------------------------------------
    const matchedFormats = FORMAT_PATTERNS.filter((fp) => fp.regex.test(prompt));

    let formatScore = 4; // 형식이 전혀 없을 때 기본 점수
    if (matchedFormats.length >= 2 || (matchedFormats.length === 1 && quantities.length > 0 && charLen >= 45)) {
      formatScore = 20;
      detectedGood.push(`🐸 출력 형식 지정 (${matchedFormats.map((f) => f.label).join(" + ")})`);
    } else if (matchedFormats.length === 1) {
      formatScore = 16;
      detectedGood.push(`🐸 출력 형식 지정 (${matchedFormats[0].label})`);
    } else if (quantities.length > 0) {
      // '5가지 알려줘'처럼 개수만 지정한 경우 부분 점수
      formatScore = 12;
    }

    const formatOk = formatScore >= 15;
    let formatComment = "";
    if (formatScore >= 16) {
      formatComment = `원하는 결과 형태(${matchedFormats.map((f) => f.label).join(", ")})를 명확하게 알려주어서 읽기 편한 답변이 나올 거예요!`;
    } else {
      formatComment = `'${mission.recommendedFormat}'처럼 표, 번호 목록, 단계별, 줄 수 등 결과물 모양을 구체적으로 지정해보세요!`;
      missingPoints.push(`'표로 정리해줘', '번호를 매겨 단계별로 알려줘' 같은 출력 형식 지정하기`);
    }

    // ---------------------------------------------------------
    // 총점 및 종합 피드백 산출
    // ---------------------------------------------------------
    const total = Math.max(0, Math.min(100, piiScore + specScore + roleScore + safeScore + formatScore));

    // 모범답안 유사도 비교
    const bestModelAnswer = mission.modelAnswers[mission.modelAnswers.length - 1];
    const similarityWithBest = computeSimilarity(prompt, bestModelAnswer.prompt);

    // 학생의 원래 프롬프트를 살린 '100점 업그레이드 추천 프롬프트' 자동 조합
    let upgradedPrompt = bestModelAnswer.prompt;
    if (total < 95 && matchedKeywords.length > 0) {
      const rolePrefix = matchedRoles.length === 0 ? `${mission.recommendedRole} 설명해줘. ` : "";
      const formatSuffix =
        matchedFormats.length === 0
          ? ` 결과를 ${mission.recommendedFormat}.`
          : "";
      const detailMid =
        specScore < 16
          ? `${mission.recommendedDetail} 알려줘.`
          : prompt;
      const candidate = `${rolePrefix}${detailMid}${formatSuffix}`
        .replace(/\s+/g, " ")
        .replace(/\.+/g, ".")
        .trim();
      if (candidate.length >= 35) {
        upgradedPrompt = candidate;
      }
    }

    let feedback = "";
    if (total >= 90) {
      feedback = `와우! 프롬프트 작성 5가지 원칙을 모두 훌륭하게 지켰어요! 👏 역할, 구체적인 조건, 원하는 출력 형식까지 명확해서 AI가 최고 수준의 답변을 들려줄 거예요.`;
    } else if (total >= 75) {
      feedback = `아주 잘 작성했어요! 👍 핵심 내용이 잘 들어가 있어요. 아래 채점표에서 아쉬운 항목(${missingPoints.slice(0, 2).join(", ") || "세부 형식"})만 조금 더 보완하면 100점 만점 프롬프트가 완성됩니다!`;
    } else if (total >= 60) {
      feedback = `좋은 시작이에요! 🌱 질문 주제는 잘 골랐지만 아직 조건이 조금 짧아요. '${mission.recommendedRole}'처럼 역할을 정해주고, '${mission.recommendedFormat}'처럼 결과 모양을 덧붙여 다시 도전해볼까요?`;
    } else {
      feedback = `조금만 더 구체적으로 적어볼까요? 💪 단순히 짧은 문장으로 묻기보다 [누구처럼(역할)] + [몇 가지를 어떤 조건으로(구체성)] + [어떤 모양으로(형식)] 알려달라고 쓰면 점수가 쑥쑥 올라가요! 아래 모범답안 예시를 참고해보세요.`;
    }

    return {
      mode: "code",
      total,
      similarityWithBest,
      detectedGood,
      missingPoints,
      upgradedPrompt,
      criteria: [
        {
          name: "🦊 개인정보 보호",
          score: piiScore,
          max: 20,
          ok: piiOk,
          comment: piiComment
        },
        {
          name: "🐼 구체적인 설명",
          score: specScore,
          max: 20,
          ok: specOk,
          comment: specComment
        },
        {
          name: "🐨 역할·눈높이 지정",
          score: roleScore,
          max: 20,
          ok: roleOk,
          comment: roleComment
        },
        {
          name: "🦁 바른 말·안전성",
          score: safeScore,
          max: 20,
          ok: safeOk,
          comment: safeComment
        },
        {
          name: "🐸 원하는 형식 제시",
          score: formatScore,
          max: 20,
          ok: formatOk,
          comment: formatComment
        }
      ],
      feedback
    };
  }

  /**
   * 2) Google Gemini API 연동 분석 엔진 (선택 사용)
   */
  async function gradePromptByGemini(mission, rawPrompt, apiKey, modelName = "gemini-2.5-flash") {
    const cleanKey = (apiKey || "").trim();
    if (!cleanKey) {
      throw new Error("Gemini API 키가 입력되지 않았습니다. 상단 설정에서 API 키를 입력하거나 '⚡ 코드 분석 모드'로 전환해주세요.");
    }

    const codeFallback = gradePromptByCode(mission, rawPrompt);

    const systemInstruction = `당신은 초·중·고 학생들에게 올바른 AI 프롬프트 작성법을 가르치는 친절한 'AI 프롬프트 선생님'입니다.
학생이 아래 미션에 대해 작성한 프롬프트를 5가지 기준(각 20점 만점, 총 100점)으로 채점하고 따뜻한 피드백과 100점짜리 개선 프롬프트를 JSON 형식으로만 응답하세요.

[미션 제목]: ${mission.title}
[미션 설명]: ${mission.desc}
[참고 100점 모범답안]: ${mission.modelAnswers[2].prompt}

[5가지 채점 기준 (각 0~20점)]:
1. "🦊 개인정보 보호" (max: 20): 실명, 전화번호, 상세 주소, 학교명 등 개인정보가 없으면 20점(ok: true), 있으면 감점(ok: false).
2. "🐼 구체적인 설명" (max: 20): 미션 주제와 맞는지, 개수(예: 3가지, 5가지)나 상황·조건을 구체적으로 설명했는지 평가 (14점 이상이면 ok: true).
3. "🐨 역할·눈높이 지정" (max: 20): AI의 역할(선생님처럼, 전문가처럼 등)이나 답변 눈높이(쉬운 말로, 초보자용 등)를 지정했는지 평가 (14점 이상이면 ok: true).
4. "🦁 바른 말·안전성" (max: 20): 욕설, 위험한 내용, 무성의한 자음 남발 없이 바르게 요청했는지 평가 (15점 이상이면 ok: true).
5. "🐸 원하는 형식 제시" (max: 20): 표, 목록, 번호, 단계별, 줄 수 등 출력 형식을 지정했는지 평가 (14점 이상이면 ok: true).

반드시 아래 JSON 스키마만 출력하세요:
{
  "total": 숫자(5개 항목 점수의 합, 0~100),
  "criteria": [
    { "name": "🦊 개인정보 보호", "score": 숫자, "max": 20, "ok": 불리언, "comment": "학생 눈높이의 친절한 설명" },
    { "name": "🐼 구체적인 설명", "score": 숫자, "max": 20, "ok": 불리언, "comment": "학생 눈높이의 친절한 설명" },
    { "name": "🐨 역할·눈높이 지정", "score": 숫자, "max": 20, "ok": 불리언, "comment": "학생 눈높이의 친절한 설명" },
    { "name": "🦁 바른 말·안전성", "score": 숫자, "max": 20, "ok": 불리언, "comment": "학생 눈높이의 친절한 설명" },
    { "name": "🐸 원하는 형식 제시", "score": 숫자, "max": 20, "ok": 불리언, "comment": "학생 눈높이의 친절한 설명" }
  ],
  "feedback": "선생님 한마디 종합 피드백 (2~3문장)",
  "upgradedPrompt": "학생의 프롬프트를 보완해 100점으로 업그레이드한 예시 프롬프트"
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `학생이 작성한 프롬프트:\n"""\n${rawPrompt}\n"""` }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData?.error?.message || `HTTP 오류 (${response.status})`;
      throw new Error(`Gemini API 호출 실패: ${msg}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error("Gemini API 응답이 비어 있습니다.");
    }

    const parsed = JSON.parse(rawText);
    const calculatedTotal = Array.isArray(parsed.criteria)
      ? parsed.criteria.reduce((acc, c) => acc + (Number(c.score) || 0), 0)
      : Number(parsed.total) || codeFallback.total;

    return {
      mode: "gemini",
      total: Math.max(0, Math.min(100, calculatedTotal)),
      similarityWithBest: codeFallback.similarityWithBest,
      detectedGood: codeFallback.detectedGood,
      missingPoints: codeFallback.missingPoints,
      upgradedPrompt: parsed.upgradedPrompt || codeFallback.upgradedPrompt,
      criteria: Array.isArray(parsed.criteria) ? parsed.criteria : codeFallback.criteria,
      feedback: parsed.feedback || codeFallback.feedback
    };
  }

  window.PromptGraderEngine = {
    gradePromptByCode,
    gradePromptByGemini
  };
})();
