// ============================================================================
// BhashaSetu - Full Application Interface Localization (i18n)
// Translates navigation, labels, headings, buttons, dialogs, notifications
// ============================================================================

export type SupportedAppLang = 'English' | 'Hindi' | 'Telugu' | 'Ho' | 'Mundari' | 'Santhali';

export interface UIStrings {
  // Brand & Topbar
  appName: string;
  appSubtitle: string;
  greetingTeacher: string;
  greetingStudent: string;
  topbarSubtitle: string;
  loginBtn: string;
  logoutBtn: string;
  switchUser: string;
  roleTeacher: string;
  roleStudent: string;
  onlineStatus: string;
  offlineStatus: string;

  // Nav Items
  navDashboard: string;
  navLessons: string;
  navWorksheets: string;
  navAssessments: string;
  navProgress: string;
  navResources: string;
  navSettings: string;
  navDictionary: string;
  navAiTranslator: string;

  // Hero & Dashboard
  heroTitle: string;
  heroDesc: string;
  metricStudents: string;
  metricLessons: string;
  metricWorksheets: string;
  metricPending: string;
  viewAllStudents: string;
  thisMonth: string;
  toBeReviewed: string;

  // AI Pipeline Card
  aiPipelineTitle: string;
  aiPipelineBadge: string;
  aiPipelineDesc: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  btnCreateLesson: string;
  btnViewLessons: string;

  // Quick Action Cards
  qaTranslateTitle: string;
  qaTranslateDesc: string;
  qaVoiceTitle: string;
  qaVoiceDesc: string;
  qaWorksheetTitle: string;
  qaWorksheetDesc: string;

  // Section Titles
  recentLessons: string;
  viewAll: string;
  interactiveLessonsTitle: string;
  worksheetsTitle: string;
  assignmentsTitle: string;
  resourcesTitle: string;
  progressTitle: string;
  settingsTitle: string;

  // Student Portal
  studentGreeting: string;
  studentSubtitle: string;
  todayLesson: string;
  startLesson: string;
  quickActions: string;
  listenLearn: string;
  audioLessons: string;
  practice: string;
  funActivities: string;
  myProgress: string;
  seeBadges: string;
  askAiTutor: string;
  doubtAskHere: string;

  // Common Buttons & Actions
  download: string;
  review: string;
  openLesson: string;
  translateNow: string;
  listenVoice: string;
  generateWorksheet: string;
  newAssignment: string;
  save: string;
  cancel: string;
  submit: string;
  syncNow: string;
  clearCache: string;

  // Modals & Notifications
  loginModalTitle: string;
  loginAsTeacher: string;
  loginAsStudent: string;
  emailLabel: string;
  passwordLabel: string;
  forgotPasswordLink: string;
  enterPassword: string;
  continueBtn: string;
  syncSuccess: string;
  offlineReady: string;
  safeModeAlert: string;
}

const UI_DICTIONARY: Record<SupportedAppLang, UIStrings> = {
  English: {
    appName: 'BhashaSetu',
    appSubtitle: 'Vernacular Pedagogy AI',
    greetingTeacher: 'Hello, Teacher! 👋',
    greetingStudent: 'Hello, Asha! 👋',
    topbarSubtitle: "Here's what's happening in your class today.",
    loginBtn: 'Login',
    logoutBtn: 'Logout',
    switchUser: 'Switch User',
    roleTeacher: 'Teacher',
    roleStudent: 'Student',
    onlineStatus: 'Online Sync Active',
    offlineStatus: 'Offline Ready (Local Cache)',

    navDashboard: 'Dashboard',
    navLessons: 'Lessons',
    navWorksheets: 'Worksheets',
    navAssessments: 'Assignments',
    navProgress: 'Student Progress',
    navResources: 'Resources',
    navSettings: 'Settings',
    navDictionary: 'Dictionary',
    navAiTranslator: 'AI Translator & Explainer',

    heroTitle: 'Teach in their language.\nThey learn better.',
    heroDesc: 'AI-powered translation and tools for Ho, Mundari & Santhali classrooms.',
    metricStudents: 'Total Students',
    metricLessons: 'Lessons Created',
    metricWorksheets: 'Worksheets Generated',
    metricPending: 'Assignments Pending',
    viewAllStudents: '👥 View all students',
    thisMonth: '📅 This month',
    toBeReviewed: '⏳ To be reviewed',

    aiPipelineTitle: 'AI Teaching Assistant',
    aiPipelineBadge: 'New',
    aiPipelineDesc: 'Create complete, culturally grounded learning material in seconds with AI.',
    step1: 'Enter Topic / Upload',
    step2: 'AI Localizes',
    step3: 'Generate Resources',
    step4: 'Assign & Track',
    btnCreateLesson: 'Create New Lesson',
    btnViewLessons: 'View My Lessons',

    qaTranslateTitle: 'Translate Content',
    qaTranslateDesc: 'Translate lessons, activities and words',
    qaVoiceTitle: 'Voice Conversation',
    qaVoiceDesc: 'Real-time voice-to-voice classroom translation',
    qaWorksheetTitle: 'Generate Worksheet',
    qaWorksheetDesc: 'Create bilingual worksheets instantly',

    recentLessons: 'Recent Lessons',
    viewAll: 'View all',
    interactiveLessonsTitle: 'Interactive Lessons in Ho, Mundari & Santhali',
    worksheetsTitle: 'Bilingual Worksheets & Activity Sheets',
    assignmentsTitle: 'Assignments & Student Submissions',
    resourcesTitle: 'Learning & Teaching Resources',
    progressTitle: 'Student Progress & Class Insights',
    settingsTitle: 'Settings & Preferences',

    studentGreeting: 'Hello, Asha! 👋',
    studentSubtitle: "Let's learn something new today.",
    todayLesson: "Today's Lesson ➔",
    startLesson: '+ Start Lesson',
    quickActions: 'Quick Actions',
    listenLearn: 'Listen & Learn',
    audioLessons: 'Audio lessons',
    practice: 'Practice',
    funActivities: 'Fun activities',
    myProgress: 'My Progress',
    seeBadges: 'See your badges',
    askAiTutor: 'Ask AI Tutor',
    doubtAskHere: 'Doubt? Ask here',

    download: 'Download',
    review: 'Review',
    openLesson: 'Open Lesson',
    translateNow: 'Translate Now',
    listenVoice: '🔊 Listen',
    generateWorksheet: '+ Generate Worksheet',
    newAssignment: '+ New Assignment',
    save: 'Save Changes',
    cancel: 'Cancel',
    submit: 'Submit Work',
    syncNow: 'Sync Now',
    clearCache: 'Clear Cache',

    loginModalTitle: 'Login to BhashaSetu',
    loginAsTeacher: 'Teacher Login',
    loginAsStudent: 'Student Login',
    emailLabel: 'Email Address or Student ID',
    passwordLabel: 'Password',
    forgotPasswordLink: 'Forgot password?',
    enterPassword: 'Enter your password',
    continueBtn: 'Sign In to Portal',
    syncSuccess: 'Synchronization complete with school cloud!',
    offlineReady: 'All offline lessons and dictionaries are cached.',
    safeModeAlert: 'Safe Mode Active: Operation verified safely.'
  },

  Hindi: {
    appName: 'भाषासेतु',
    appSubtitle: 'मातृभाषा शिक्षण एआई',
    greetingTeacher: 'नमस्ते, शिक्षिका जी! 👋',
    greetingStudent: 'नमस्ते, आशा! 👋',
    topbarSubtitle: 'आज आपकी कक्षा में होने वाली गतिविधियाँ।',
    loginBtn: 'लॉग इन',
    logoutBtn: 'लॉग आउट',
    switchUser: 'उपयोगकर्ता बदलें',
    roleTeacher: 'शिक्षक',
    roleStudent: 'विद्यार्थी',
    onlineStatus: 'ऑनलाइन सिंक सक्रिय',
    offlineStatus: 'ऑफ़लाइन तैयार (स्थानीय कैश)',

    navDashboard: 'डैशबोर्ड',
    navLessons: 'पाठ एवं सामग्री',
    navWorksheets: 'अभ्यास पत्रक',
    navAssessments: 'गृहकार्य एवं असाइनमेंट',
    navProgress: 'छात्र प्रगति',
    navResources: 'शिक्षण संसाधन',
    navSettings: 'सेटिंग्स',
    navDictionary: 'शब्दावली',
    navAiTranslator: 'एआई अनुवादक और व्याख्याकार',

    heroTitle: 'उनकी अपनी भाषा में सिखाएं।\nवे बेहतर सीखते हैं।',
    heroDesc: 'हो, मुंडारी और संथाली प्राथमिक कक्षाओं के लिए एआई-संचालित अनुवाद एवं उपकरण।',
    metricStudents: 'कुल विद्यार्थी',
    metricLessons: 'बनाए गए पाठ',
    metricWorksheets: 'अभ्यास पत्रक',
    metricPending: 'लंबित असाइनमेंट',
    viewAllStudents: '👥 सभी विद्यार्थी देखें',
    thisMonth: '📅 इस माह',
    toBeReviewed: '⏳ समीक्षा बाकी',

    aiPipelineTitle: 'एआई शिक्षण सहायक',
    aiPipelineBadge: 'नया',
    aiPipelineDesc: 'एआई की मदद से कुछ ही सेकंड में सांस्कृतिक संदर्भ वाली पूर्ण शिक्षण सामग्री बनाएं।',
    step1: 'विषय दर्ज करें / फ़ाइल अपलोड',
    step2: 'एआई मातृभाषा रूपांतरण',
    step3: 'संसाधन निर्माण (आवाज, प्रश्न, पत्रक)',
    step4: 'कक्षा में सौंपें व प्रगति देखें',
    btnCreateLesson: 'नया पाठ बनाएँ',
    btnViewLessons: 'मेरे पाठ देखें',

    qaTranslateTitle: 'सामग्री का अनुवाद',
    qaTranslateDesc: 'पाठ, गतिविधियों और शब्दों का अनुवाद करें',
    qaVoiceTitle: 'ध्वनि वार्तालाप',
    qaVoiceDesc: 'कक्षा में रीयल-टाइम वॉइस-टू-वॉइस अनुवाद',
    qaWorksheetTitle: 'अभ्यास पत्रक बनाएँ',
    qaWorksheetDesc: 'तुरंत द्विभाषी वर्कशीट तैयार करें',

    recentLessons: 'हाल के पाठ',
    viewAll: 'सभी देखें',
    interactiveLessonsTitle: 'हो, मुंडारी और संथाली में संवादात्मक पाठ',
    worksheetsTitle: 'द्विभाषी अभ्यास पत्रक एवं गतिविधियाँ',
    assignmentsTitle: 'असाइनमेंट एवं छात्र प्रस्तुतियाँ',
    resourcesTitle: 'सीखने और सिखाने के संसाधन',
    progressTitle: 'विद्यार्थी प्रगति एवं कक्षा अंतर्दृष्टि',
    settingsTitle: 'सेटिंग्स एवं प्राथमिकताएँ',

    studentGreeting: 'नमस्ते, आशा! 👋',
    studentSubtitle: 'आइए आज कुछ नया सीखें।',
    todayLesson: 'आज का पाठ ➔',
    startLesson: '+ पाठ शुरू करें',
    quickActions: 'त्वरित गतिविधियाँ',
    listenLearn: 'सुनें और सीखें',
    audioLessons: 'ऑडियो पाठ',
    practice: 'अभ्यास करें',
    funActivities: 'रोचक गतिविधियाँ',
    myProgress: 'मेरी प्रगति',
    seeBadges: 'अपने बैज देखें',
    askAiTutor: 'एआई ट्यूटर से पूछें',
    doubtAskHere: 'कोई सवाल? यहाँ पूछें',

    download: 'डाउनलोड',
    review: 'समीक्षा करें',
    openLesson: 'पाठ खोलें',
    translateNow: 'अभी अनुवाद करें',
    listenVoice: '🔊 सुनें',
    generateWorksheet: '+ अभ्यास पत्रक बनाएँ',
    newAssignment: '+ नया असाइनमेंट',
    save: 'बदलाव सहेजें',
    cancel: 'रद्द करें',
    submit: 'जमा करें',
    syncNow: 'अभी सिंक करें',
    clearCache: 'कैश खाली करें',

    loginModalTitle: 'भाषासेतु में प्रवेश करें',
    loginAsTeacher: 'शिक्षक लॉगिन',
    loginAsStudent: 'विद्यार्थी लॉगिन',
    emailLabel: 'ईमेल पता या छात्र आईडी',
    passwordLabel: 'पासवर्ड',
    forgotPasswordLink: 'पासवर्ड भूल गए?',
    enterPassword: 'पासवर्ड दर्ज करें',
    continueBtn: 'पोर्टल में प्रवेश करें',
    syncSuccess: 'स्कूल क्लाउड के साथ डेटा सफलतापूर्वक सिंक हो गया!',
    offlineReady: 'सभी ऑफ़लाइन पाठ और शब्दकोश डिवाइस में उपलब्ध हैं।',
    safeModeAlert: 'सुरक्षित मोड सक्रिय: सामग्री सुरक्षित रूप से जाँची गई।'
  },

  Telugu: {
    appName: 'భాషాసేతు',
    appSubtitle: 'మాతృభాషా విద్యా AI',
    greetingTeacher: 'నమస్కారం, ఉపాధ్యాయులు గారూ! 👋',
    greetingStudent: 'హలో, ఆశా! 👋',
    topbarSubtitle: 'ఈరోజు మీ తరగతిలో జరుగుతున్న కార్యక్రమాలు.',
    loginBtn: 'లాగిన్',
    logoutBtn: 'లాగౌట్',
    switchUser: 'వినియోగదారుని మార్చండి',
    roleTeacher: 'ఉపాధ్యాయుడు',
    roleStudent: 'విద్యార్థి',
    onlineStatus: 'ఆన్‌లైన్ సమకాలీకరణ క్రియాశీలం',
    offlineStatus: 'ఆఫ్‌లైన్ సిద్ధంగా ఉంది (స్థానిక కాష్)',

    navDashboard: 'డాష్‌బోర్డ్',
    navLessons: 'పాఠాలు',
    navWorksheets: 'వర్క్‌షీట్‌లు',
    navAssessments: 'అసైన్‌మెంట్‌లు',
    navProgress: 'విద్యార్థి పురోగతి',
    navResources: 'వనరులు',
    navSettings: 'సెట్టింగ్‌లు',
    navDictionary: 'నిఘంటువు',
    navAiTranslator: 'AI అనువాదకుడు & వివరణకర్త',

    heroTitle: 'వారి భాషలోనే నేర్పించండి.\nవారు మెరుగ్గా నేర్చుకుంటారు.',
    heroDesc: 'హో, ముండారీ మరియు సంతాలీ తరగతులకు AI ఆధారిత అనువాదం మరియు విద్యా సాధనాలు.',
    metricStudents: 'మొత్తం విద్యార్థులు',
    metricLessons: 'సృష్టించిన పాఠాలు',
    metricWorksheets: 'రూపొందించిన వర్క్‌షీట్‌లు',
    metricPending: 'పెండింగ్ అసైన్‌మెంట్‌లు',
    viewAllStudents: '👥 విద్యార్థులందరినీ చూడండి',
    thisMonth: '📅 ఈ నెల',
    toBeReviewed: '⏳ సమీక్షించాల్సినవి',

    aiPipelineTitle: 'AI బోధనా సహాయకుడు',
    aiPipelineBadge: 'కొత్తది',
    aiPipelineDesc: 'AI ద్వారా సాంస్కృతిక ఆధారిత బోధనా సామాగ్రిని క్షణాల్లో రూపొందించండి.',
    step1: 'అంశం నమోదు / ఫైల్ అప్‌లోడ్',
    step2: 'AI స్థానికీకరణ',
    step3: 'వనరుల సృష్టి (ధ్వని, ప్రశ్నలు, పత్రాలు)',
    step4: 'తరగతికి కేటాయింపు & ట్రాకింగ్',
    btnCreateLesson: 'కొత్త పాఠాన్ని సృష్టించండి',
    btnViewLessons: 'నా పాఠాలను చూడండి',

    qaTranslateTitle: 'కంటెంట్ అనువదించండి',
    qaTranslateDesc: 'పాఠాలు, పదాలు మరియు కార్యకలాపాలను అనువదించండి',
    qaVoiceTitle: 'వాయిస్ సంభాషణ',
    qaVoiceDesc: 'తరగతి గదిలో రియల్-టైమ్ వాయిస్ అనువాదం',
    qaWorksheetTitle: 'వర్క్‌షీట్ రూపొందించండి',
    qaWorksheetDesc: 'ద్విభాషా వర్క్‌షీట్లను తక్షణమే తయారు చేయండి',

    recentLessons: 'ఇటీవలి పాఠాలు',
    viewAll: 'అన్నీ చూడండి',
    interactiveLessonsTitle: 'హో, ముండారీ మరియు సంతాలీలో ఇంటరాక్టివ్ పాఠాలు',
    worksheetsTitle: 'ద్విభాషా వర్క్‌షీట్‌లు & అభ్యాస పత్రాలు',
    assignmentsTitle: 'అసైన్‌మెంట్‌లు & విద్యార్థి సమర్పణలు',
    resourcesTitle: 'అభ్యాస మరియు బోధనా వనరులు',
    progressTitle: 'విద్యార్థి పురోగతి & తరగతి విశ్లేషణలు',
    settingsTitle: 'సెట్టింగ్‌లు & ప్రాధాన్యతలు',

    studentGreeting: 'హలో, ఆశా! 👋',
    studentSubtitle: 'ఈరోజు కొత్తగా ఏదైనా నేర్చుకుందాం.',
    todayLesson: 'నేటి పాఠం ➔',
    startLesson: '+ పాఠం ప్రారంభించండి',
    quickActions: 'త్వరిత చర్యలు',
    listenLearn: 'వింటూ నేర్చుకోండి',
    audioLessons: 'ఆడియో పాఠాలు',
    practice: 'అభ్యాసం',
    funActivities: 'ఆనందకరమైన ఆటలు',
    myProgress: 'నా పురోగతి',
    seeBadges: 'మీ బ్యాడ్జ్‌లను చూడండి',
    askAiTutor: 'AI ట్యూటర్‌ని అడగండి',
    doubtAskHere: 'సందేహమా? ఇక్కడ అడగండి',

    download: 'డౌన్‌లోడ్',
    review: 'సమీక్షించండి',
    openLesson: 'పాఠం తెరవండి',
    translateNow: 'ఇప్పుడే అనువదించండి',
    listenVoice: '🔊 వినండి',
    generateWorksheet: '+ వర్క్‌షీట్ సృష్టించండి',
    newAssignment: '+ కొత్త అసైన్‌మెంట్',
    save: 'మార్పులను భద్రపరచండి',
    cancel: 'రద్దు చేయండి',
    submit: 'సమర్పించండి',
    syncNow: 'ఇప్పుడే సింక్ చేయండి',
    clearCache: 'కాష్‌ను తొలగించండి',

    loginModalTitle: 'భాషాసేతులోకి లాగిన్ అవ్వండి',
    loginAsTeacher: 'ఉపాధ్యాయుల లాగిన్',
    loginAsStudent: 'విద్యార్థి లాగిన్',
    emailLabel: 'ఈమెయిల్ లేదా విద్యార్థి ID',
    passwordLabel: 'పాస్‌వర్డ్',
    forgotPasswordLink: 'పాస్‌వర్డ్ మర్చిపోయారా?',
    enterPassword: 'పాస్‌వర్డ్ నమోదు చేయండి',
    continueBtn: 'పోర్టల్‌లోకి ప్రవేశించండి',
    syncSuccess: 'స్కూల్ క్లౌడ్‌తో విజయవంతంగా సింక్ చేయబడింది!',
    offlineReady: 'అన్ని ఆఫ్‌లైన్ పాఠాలు మరియు నిఘంటువులు సిద్ధంగా ఉన్నాయి.',
    safeModeAlert: 'సురక్షిత మోడ్ క్రియాశీలం: ఆపరేషన్ ధృవీకరించబడింది.'
  },

  Ho: {
    appName: 'BhashaSetu (𑢹𑣉)',
    appSubtitle: 'Aapan Parsi Itun AI',
    greetingTeacher: 'Johar, Master Gomke! 👋',
    greetingStudent: 'Johar, Asha! 👋',
    topbarSubtitle: 'Tising itun ovah re hobatinah kamiko.',
    loginBtn: 'Bolo (Login)',
    logoutBtn: 'Udung (Logout)',
    switchUser: 'Hor Bodol',
    roleTeacher: 'Master',
    roleStudent: 'Hon',
    onlineStatus: 'Online Sync Jid',
    offlineStatus: 'Offline Ready (Local Cache)',

    navDashboard: 'Dashboard',
    navLessons: 'Path (पाठ)',
    navWorksheets: 'Worksheet (अभ्यास)',
    navAssessments: 'Kami (Assignments)',
    navProgress: 'Honko Padhaw',
    navResources: 'Puthi & Baha (Resources)',
    navSettings: 'Settings',
    navDictionary: 'Kaji Dictionaries',
    navAiTranslator: 'AI Translator & Explainer',

    heroTitle: 'Aapan parsi te ituko.\nSukute itue.',
    heroDesc: 'Ho, Mundari & Santhali itun lagit AI parsi itun.',
    metricStudents: 'Sobon Honko',
    metricLessons: 'Olakad Path',
    metricWorksheets: 'Worksheetko',
    metricPending: 'Leka Kami',
    viewAllStudents: '👥 Sobon honko nelpe',
    thisMonth: '📅 Nena chando',
    toBeReviewed: '⏳ Nel bichar',

    aiPipelineTitle: 'AI Itun Gomke',
    aiPipelineBadge: 'Nawa',
    aiPipelineDesc: 'Ghadi re aapan hadam kaji lagit itun sanam baipe.',
    step1: 'Kaji Olpe / File Udug',
    step2: 'AI Parsi Bodol',
    step3: 'Resource Bai (Sari, Kuli)',
    step4: 'Honko Empe & Nelpe',
    btnCreateLesson: '+ Nawa Path Bai',
    btnViewLessons: 'Aapan Path Nel',

    qaTranslateTitle: 'Kaji Bodol (Translate)',
    qaTranslateDesc: 'Path, kaji ar sobon bodolpe',
    qaVoiceTitle: 'Kaji Sari (Voice)',
    qaVoiceDesc: 'Parsi ror aayam ar itun',
    qaWorksheetTitle: 'Worksheet Bai',
    qaWorksheetDesc: 'Aapan parsi worksheet tola baipe',

    recentLessons: 'Nawa Pathko',
    viewAll: 'Sanam Nel',
    interactiveLessonsTitle: 'Ho, Mundari & Santhali Pathko',
    worksheetsTitle: 'Bilingual Worksheet & Activities',
    assignmentsTitle: 'Kami & Submissions',
    resourcesTitle: 'Puthi, Audio & Images',
    progressTitle: 'Honko Laha Nel',
    settingsTitle: 'Settings',

    studentGreeting: 'Johar, Asha! 👋',
    studentSubtitle: 'Tising nawa kaji itue.',
    todayLesson: 'Tising Path ➔',
    startLesson: '+ Path Ehob',
    quickActions: 'Lagan Kami',
    listenLearn: 'Aayam & Itu',
    audioLessons: 'Audio Path',
    practice: 'Itu Kami',
    funActivities: 'Raska Kami',
    myProgress: 'Aingah Laha',
    seeBadges: 'Star & Badge Nel',
    askAiTutor: 'AI Tutor Kuliye',
    doubtAskHere: 'Doubt? Nandre kuli',

    download: 'Aagu (Download)',
    review: 'Bichar (Review)',
    openLesson: 'Path Udug',
    translateNow: 'Kaji Bodolpe',
    listenVoice: '🔊 Aayam',
    generateWorksheet: '+ Worksheet Bai',
    newAssignment: '+ Nawa Kami',
    save: 'Dohaye (Save)',
    cancel: 'Bageye',
    submit: 'Emape (Submit)',
    syncNow: 'Sync Tising',
    clearCache: 'Cache Saphaye',

    loginModalTitle: 'BhashaSetu Re Bolo',
    loginAsTeacher: 'Master Login',
    loginAsStudent: 'Hon Login',
    emailLabel: 'Email / Student ID',
    passwordLabel: 'Password',
    forgotPasswordLink: 'Password ruring yana?',
    enterPassword: 'Password olpe',
    continueBtn: 'Bolo Portal Re',
    syncSuccess: 'School Cloud re sobon data dohayana!',
    offlineReady: 'Sobon offline path ar dictionaries ready menah-a.',
    safeModeAlert: 'Safe Mode Jid Menah-a.'
  },

  Mundari: {
    appName: 'BhashaSetu (मुंडारी)',
    appSubtitle: 'मातृभाषा शिक्षण एआई',
    greetingTeacher: 'जोहार, मास्टर गोमके! 👋',
    greetingStudent: 'जोहार, आशा! 👋',
    topbarSubtitle: 'तिसिंग आबुवाः इस्कुल रेनाः कामिको।',
    loginBtn: 'बोलो (Login)',
    logoutBtn: 'उडुंग (Logout)',
    switchUser: 'होड़ बदोल',
    roleTeacher: 'मास्टर',
    roleStudent: 'गितिः',
    onlineStatus: 'Online Sync Active',
    offlineStatus: 'Offline Ready (Local Cache)',

    navDashboard: 'Dashboard',
    navLessons: 'पाठ (Lessons)',
    navWorksheets: 'अभ्यास (Worksheets)',
    navAssessments: 'असाइनमेंट (Assignments)',
    navProgress: 'छात्र प्रगति (Progress)',
    navResources: 'संसाधन (Resources)',
    navSettings: 'Settings',
    navDictionary: 'शब्दावली (Dictionary)',
    navAiTranslator: 'एआई अनुवादक और व्याख्याकार',

    heroTitle: 'आपन पारसी ते इतुपे।\nबेस लेका इतुए।',
    heroDesc: 'हो, मुंडारी आर संथाली प्राथमिक इस्कुल को लागीत एआई पारसी इतुन।',
    metricStudents: 'सोबेन गितिःको',
    metricLessons: 'ओलाकद पाठ',
    metricWorksheets: 'अभ्यास पत्रक',
    metricPending: 'लंबित कामिको',
    viewAllStudents: '👥 सोबेन गितिःको नेलपे',
    thisMonth: '📅 नेना चन्दो',
    toBeReviewed: '⏳ नेल बिचार',

    aiPipelineTitle: 'एआई शिक्षण सहायक',
    aiPipelineBadge: 'नावा',
    aiPipelineDesc: 'एआई ते आपन पारसी पाठ सामांग तोड़ांग रे बईपे।',
    step1: 'विषय ओलपे / File',
    step2: 'एआई पारसी बदोल',
    step3: 'संसाधन बई (साड़ी, कुली)',
    step4: 'कक्षा रे एमपे आर नेलपे',
    btnCreateLesson: '+ नावा पाठ बई',
    btnViewLessons: 'आपन पाठ नेल',

    qaTranslateTitle: 'काजी बदोल (Translate)',
    qaTranslateDesc: 'पाठ, काजी आर सोबेन बदोलपे',
    qaVoiceTitle: 'काजी साड़ी (Voice)',
    qaVoiceDesc: 'पारसी रोड़ आयम आर इतु',
    qaWorksheetTitle: 'Worksheet बई',
    qaWorksheetDesc: 'आपन पारसी अभ्यास पत्रक बईपे',

    recentLessons: 'नावा पाठको',
    viewAll: 'सोबेन नेल',
    interactiveLessonsTitle: 'हो, मुंडारी आर संथाली पाठको',
    worksheetsTitle: 'द्विभाषी अभ्यास पत्रक',
    assignmentsTitle: 'कामिको आर Submissions',
    resourcesTitle: 'पुथी, Audio आर Images',
    progressTitle: 'गितिःको लाहा नेल',
    settingsTitle: 'Settings',

    studentGreeting: 'जोहार, आशा! 👋',
    studentSubtitle: 'तिसिंग नावा काजी इतुए।',
    todayLesson: 'तिसिंग पाठ ➔',
    startLesson: '+ पाठ एहॉब',
    quickActions: 'लगन कामिको',
    listenLearn: 'आयम आर इतु',
    audioLessons: 'Audio पाठ',
    practice: 'इतु कामिको',
    funActivities: 'रसिका कामिको',
    myProgress: 'अईंयाः लाहा',
    seeBadges: 'Star आर Badge नेल',
    askAiTutor: 'AI Tutor कुलीये',
    doubtAskHere: 'संदेह? नन्दे कुली',

    download: 'डाउनलोड',
    review: 'बिचार (Review)',
    openLesson: 'पाठ उडुंग',
    translateNow: 'काजी बदोलपे',
    listenVoice: '🔊 आयम',
    generateWorksheet: '+ Worksheet बई',
    newAssignment: '+ नावा असाइनमेंट',
    save: 'सहेजे (Save)',
    cancel: 'रद्द',
    submit: 'एमपे (Submit)',
    syncNow: 'तिसिंग Sync',
    clearCache: 'Cache सफाए',

    loginModalTitle: 'भाषासेतु रे बोलो',
    loginAsTeacher: 'मास्टर Login',
    loginAsStudent: 'गितिः Login',
    emailLabel: 'Email / Student ID',
    passwordLabel: 'Password',
    forgotPasswordLink: 'Password भूल गए?',
    enterPassword: 'Password ओलपे',
    continueBtn: 'बोलो Portal रे',
    syncSuccess: 'School Cloud रे डेटा सिंक होबायाना!',
    offlineReady: 'सोबेन ऑफ़लाइन पाठ आर शब्दकोश रेडी मेनाः-आ।',
    safeModeAlert: 'Safe Mode सक्रिय मेनाः-आ।'
  },

  Santhali: {
    appName: 'ᱵᱷᱟᱥᱟᱥᱮᱛᱩ (ᱚᱞ ᱪᱤᱠᱤ)',
    appSubtitle: 'ᱟᱭᱳ ᱟᱲᱟᱝ ᱥᱮᱪᱮᱫ AI',
    greetingTeacher: 'ᱡᱚᱦᱟᱨ, ᱢᱟᱪᱮᱛ ᱜᱚᱢᱠᱮ! 👋',
    greetingStudent: 'ᱡᱚᱦᱟᱨ, ᱟᱥᱟ! 👋',
    topbarSubtitle: 'ᱛᱮᱦᱮᱧ ᱟᱥᱲᱟ ᱨᱮᱱᱟᱜ ᱠᱟᱹᱢᱤᱦᱚᱨᱟ᱾',
    loginBtn: 'ᱵᱚᱞᱚᱱ (Login)',
    logoutBtn: 'ᱚᱰᱚᱠ (Logout)',
    switchUser: 'ᱵᱚᱫᱚᱞ (Switch)',
    roleTeacher: 'ᱢᱟᱪᱮᱛ',
    roleStudent: 'ᱜᱤᱫᱽᱨᱟᱹ',
    onlineStatus: 'Online Sync ᱪᱟᱹᱞᱩ',
    offlineStatus: 'Offline Ready (Local Cache)',

    navDashboard: 'Dashboard',
    navLessons: 'ᱯᱟᱲᱦᱟᱣ (Lessons)',
    navWorksheets: 'Worksheet (अभ्यास)',
    navAssessments: 'ᱠᱟᱹᱢᱤ (Assignments)',
    navProgress: 'ᱜᱤᱫᱽᱨᱟᱹ ᱞᱟᱦᱟᱱᱛᱤ (Progress)',
    navResources: 'ᱯᱩᱛᱷᱤ & ᱥᱟᱢᱟᱝ (Resources)',
    navSettings: 'Settings',
    navDictionary: 'ᱟᱹᱲᱟᱹ ᱢᱩᱨᱟᱹᱭ (Dictionary)',
    navAiTranslator: 'AI ᱛᱚᱨᱡᱚᱢᱟ ᱟᱨ ᱵᱩᱡᱷᱟᱹᱣᱤᱡ',

    heroTitle: 'ᱟᱯᱱᱟᱨ ᱟᱲᱟᱝ ᱛᱮ ᱯᱟᱲᱦᱟᱣᱠᱚᱯᱮ᱾\nᱱᱟᱯᱟᱭ ᱠᱚ ᱪᱮᱫᱚᱜᱼᱟ᱾',
    heroDesc: 'ᱦᱳ, ᱢᱩᱱᱰᱟᱨᱤ ᱟᱨ ᱥᱟᱱᱛᱟᱲᱤ ᱯᱨᱟᱭᱢᱟᱨᱤ ᱟᱥᱲᱟ ᱞᱟᱹᱜᱤᱫ AI ᱥᱟᱫᱷᱚᱱ᱾',
    metricStudents: 'ᱡᱚᱛᱚ ᱜᱤᱫᱽᱨᱟᱹ',
    metricLessons: 'ᱵᱮᱱᱟᱣ ᱯᱟᱲᱦᱟᱣ',
    metricWorksheets: 'Worksheets',
    metricPending: 'ᱵᱟᱹᱠᱤ ᱠᱟᱹᱢᱤ',
    viewAllStudents: '👥 ᱡᱚᱛᱚ ᱜᱤᱫᱽᱨᱟᱹ ᱧᱮᱞ',
    thisMonth: '📅 ᱱᱚᱣᱟ ᱪᱟᱸᱫᱚ',
    toBeReviewed: '⏳ ᱧᱮᱞ ᱵᱤᱪᱟᱹᱨ',

    aiPipelineTitle: 'AI ᱥᱮᱪᱮᱫ ᱜᱚᱲᱚᱭᱤᱡ',
    aiPipelineBadge: 'ᱱᱟᱣᱟ',
    aiPipelineDesc: 'AI ᱜᱚᱲᱚ ᱛᱮ ᱟᱹᱰᱤ ᱩᱥᱟᱹᱨᱟ ᱟᱭᱳ ᱟᱲᱟᱝ ᱛᱮ ᱥᱮᱪᱮᱫ ᱥᱟᱢᱟᱱ ᱵᱮᱱᱟᱣᱯᱮ᱾',
    step1: 'ᱥᱟᱛᱟᱢ ᱚᱞ / File Upload',
    step2: 'AI ᱟᱲᱟᱝ ᱵᱚᱫᱚᱞ',
    step3: 'ᱥᱟᱢᱟᱱ ᱵᱮᱱᱟᱣ (ᱥᱟᱰᱮ, ᱠᱩᱠᱞᱤ)',
    step4: 'ᱟᱥᱲᱟ ᱨᱮ ᱮᱢ & ᱧᱮᱞ',
    btnCreateLesson: '+ ᱱᱟᱣᱟ ᱯᱟᱲᱦᱟᱣ ᱵᱮᱱᱟᱣ',
    btnViewLessons: 'ᱤᱧᱟᱜ ᱯᱟᱲᱦᱟᱣ ᱧᱮᱞ',

    qaTranslateTitle: 'ᱟᱲᱟᱝ ᱵᱚᱫᱚᱞ (Translate)',
    qaTranslateDesc: 'ᱯᱟᱲᱦᱟᱣ, ᱠᱟᱹᱢᱤ ᱟᱨ ᱟᱹᱲᱟᱹ ᱵᱚᱫᱚᱞᱯᱮ',
    qaVoiceTitle: 'ᱨᱚᱲ ᱥᱟᱰᱮ (Voice)',
    qaVoiceDesc: 'ᱟᱥᱲᱟ ᱨᱮ ᱨᱤᱭᱟᱞ-ᱴᱟᱭᱤᱢ ᱨᱚᱲ ᱵᱚᱫᱚᱞ',
    qaWorksheetTitle: 'Worksheet ᱵᱮᱱᱟᱣ',
    qaWorksheetDesc: 'ᱵᱟᱨ ᱯᱟᱹᱨᱥᱤ ᱟᱱᱟᱜ ᱠᱟᱹᱢᱤ ᱥᱟᱠᱟᱢ ᱵᱮᱱᱟᱣ',

    recentLessons: 'ᱱᱟᱦᱟᱜ ᱯᱟᱲᱦᱟᱣ',
    viewAll: 'ᱡᱚᱛᱚ ᱧᱮᱞ',
    interactiveLessonsTitle: 'ᱦᱳ, ᱢᱩᱱᱰᱟᱨᱤ ᱟᱨ ᱥᱟᱱᱛᱟᱲᱤ ᱯᱟᱲᱦᱟᱣ',
    worksheetsTitle: 'ᱵᱟᱨ ᱯᱟᱹᱨᱥᱤ Worksheet ᱠᱚ',
    assignmentsTitle: 'ᱠᱟᱹᱢᱤ & ᱮᱢ ᱟᱠᱟᱱ',
    resourcesTitle: 'ᱯᱩᱛᱷᱤ, ᱥᱟᱰᱮ & ᱪᱤᱛᱟᱹᱨ ᱠᱚ',
    progressTitle: 'ᱜᱤᱫᱽᱨᱟᱹ ᱞᱟᱦᱟᱱᱛᱤ',
    settingsTitle: 'Settings',

    studentGreeting: 'ᱡᱚᱦᱟᱨ, ᱟᱥᱟ! 👋',
    studentSubtitle: 'ᱛᱮᱦᱮᱧ ᱱᱟᱣᱟ ᱡᱟᱦᱟᱱᱟᱜ ᱵᱚ ᱪᱮᱫᱚᱜᱼᱟ᱾',
    todayLesson: 'ᱛᱮᱦᱮᱧᱟᱜ ᱯᱟᱲᱦᱟᱣ ➔',
    startLesson: '+ ᱯᱟᱲᱦᱟᱣ ᱮᱦᱚᱵ',
    quickActions: 'ᱩᱥᱟᱹᱨᱟ ᱠᱟᱹᱢᱤ',
    listenLearn: 'ᱟᱧᱡᱚᱢ & ᱪᱮᱫ',
    audioLessons: 'ᱥᱟᱰᱮ ᱯᱟᱲᱦᱟᱣ',
    practice: 'ᱚᱞ ᱟᱨ ᱪᱮᱫ',
    funActivities: 'ᱨᱟᱹᱥᱠᱟᱹ ᱠᱟᱹᱢᱤ',
    myProgress: 'ᱤᱧᱟᱜ ᱞᱟᱦᱟᱱᱛᱤ',
    seeBadges: 'Star & Badge ᱧᱮᱞ',
    askAiTutor: 'AI ᱴᱤᱣᱴᱚᱨ ᱠᱩᱞᱤᱭᱮ',
    doubtAskHere: 'ᱠᱩᱠᱞᱤ? ᱱᱚᱸᱰᱮ ᱠᱩᱞᱤ',

    download: 'Download',
    review: 'ᱵᱤᱪᱟᱹᱨ (Review)',
    openLesson: 'ᱯᱟᱲᱦᱟᱣ ᱠᱷᱩᱞᱟᱹᱣ',
    translateNow: 'ᱱᱤᱛᱚᱜ ᱵᱚᱫᱚᱞᱯᱮ',
    listenVoice: '🔊 ᱟᱧᱡᱚᱢ',
    generateWorksheet: '+ Worksheet ᱵᱮᱱᱟᱣ',
    newAssignment: '+ ᱱᱟᱣᱟ ᱠᱟᱹᱢᱤ',
    save: 'ᱥᱟᱧᱪᱟᱣ (Save)',
    cancel: 'ᱵᱟᱹᱜᱤ',
    submit: 'ᱮᱢ (Submit)',
    syncNow: 'ᱱᱤᱛᱚᱜ Sync',
    clearCache: 'Cache ᱯᱷᱟᱨᱪᱟ',

    loginModalTitle: 'ᱵᱷᱟᱥᱟᱥᱮᱛᱩ ᱨᱮ ᱵᱚᱞᱚᱱ',
    loginAsTeacher: 'ᱢᱟᱪᱮᱛ Login',
    loginAsStudent: 'ᱜᱤᱫᱽᱨᱟᱹ Login',
    emailLabel: 'Email / Student ID',
    passwordLabel: 'Password',
    forgotPasswordLink: 'Password ᱦᱤᱲᱤᱧ ᱮᱱᱟ?',
    enterPassword: 'Password ᱚᱞᱯᱮ',
    continueBtn: 'Portal ᱨᱮ ᱵᱚᱞᱚᱱ',
    syncSuccess: 'School Cloud ᱨᱮ ᱡᱚᱛᱚ Data Sync ᱮᱱᱟ!',
    offlineReady: 'ᱡᱚᱛᱚ Offline ᱯᱟᱲᱦᱟᱣ ᱟᱨ ᱟᱹᱲᱟᱹ ᱢᱩᱨᱟᱹᱭ ready ᱢᱮᱱᱟᱜᱼᱟ᱾',
    safeModeAlert: 'Safe Mode ᱪᱟᱹᱞᱩ ᱢᱮᱱᱟᱜᱼᱟ᱾'
  }
};

let currentLang: SupportedAppLang = 'English';

export function getAppLang(): SupportedAppLang {
  return currentLang;
}

export function setAppLang(lang: SupportedAppLang): void {
  currentLang = lang;
  applyLanguageToDOM(lang);
}

export function getI18n(): UIStrings {
  return UI_DICTIONARY[currentLang] || UI_DICTIONARY.English;
}

export function applyLanguageToDOM(lang: SupportedAppLang): void {
  const strings = UI_DICTIONARY[lang] || UI_DICTIONARY.English;

  // 1. Topbar elements
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) {
    const isTeacher = document.getElementById('topbar-role-text')?.textContent?.includes('Teacher') || document.getElementById('topbar-role-text')?.textContent?.includes('शिक्षक') || document.getElementById('topbar-role-text')?.textContent?.includes('Master');
    topbarTitle.innerHTML = (isTeacher ? strings.greetingTeacher : strings.greetingStudent) + ' <span aria-hidden="true">👋</span>';
  }

  const topbarDesc = document.getElementById('topbar-desc');
  if (topbarDesc) topbarDesc.textContent = strings.topbarSubtitle;

  const btnOpenLogin = document.getElementById('btn-open-login');
  if (btnOpenLogin) btnOpenLogin.textContent = strings.loginBtn;

  // 2. Navigation items
  const navMap: Record<string, string> = {
    'nav-item-dashboard': strings.navDashboard,
    'nav-item-lessons': strings.navLessons,
    'nav-item-worksheets': strings.navWorksheets,
    'nav-item-assessments': strings.navAssessments,
    'nav-item-progress': strings.navProgress,
    'nav-item-resources': strings.navResources,
    'nav-item-settings': strings.navSettings,
    'nav-item-dictionary': strings.navDictionary,
    'nav-item-ai-translator': strings.navAiTranslator
  };

  for (const [id, text] of Object.entries(navMap)) {
    const el = document.getElementById(id);
    if (el) {
      const span = el.querySelector('span');
      if (span) span.textContent = text;
    }
  }

  // 3. Hero Section
  const heroHeading = document.querySelector('.hero-banner h2');
  if (heroHeading) {
    heroHeading.innerHTML = strings.heroTitle.replace('\n', '<br>');
  }
  const heroRoleDesc = document.getElementById('hero-role-desc');
  if (heroRoleDesc) heroRoleDesc.textContent = strings.heroDesc;

  // 4. Metric Labels
  const metricLabels = document.querySelectorAll('.metric-label');
  if (metricLabels.length >= 4) {
    metricLabels[0].textContent = strings.metricStudents;
    metricLabels[1].textContent = strings.metricLessons;
    metricLabels[2].textContent = strings.metricWorksheets;
    metricLabels[3].textContent = strings.metricPending;
  }

  // 5. AI Pipeline
  const pipeTitle = document.querySelector('.ai-pipeline-title-wrap h3');
  if (pipeTitle) pipeTitle.textContent = strings.aiPipelineTitle;
  const pipeDesc = document.querySelector('.ai-pipeline-card > p');
  if (pipeDesc) pipeDesc.textContent = strings.aiPipelineDesc;
  const pipeBtn = document.querySelector('.btn-create-lesson-ai span');
  if (pipeBtn) pipeBtn.textContent = strings.btnCreateLesson;
  const pipeOutline = document.querySelector('.ai-pipeline-actions .btn-outline-action');
  if (pipeOutline) pipeOutline.textContent = strings.btnViewLessons;

  // 6. Quick actions
  const qaCards = document.querySelectorAll('.qa-card');
  if (qaCards.length >= 3) {
    const t0 = qaCards[0].querySelector('.qa-title');
    const d0 = qaCards[0].querySelector('.qa-desc');
    if (t0) t0.textContent = strings.qaTranslateTitle;
    if (d0) d0.textContent = strings.qaTranslateDesc;

    const t1 = qaCards[1].querySelector('.qa-title');
    const d1 = qaCards[1].querySelector('.qa-desc');
    if (t1) t1.textContent = strings.qaVoiceTitle;
    if (d1) d1.textContent = strings.qaVoiceDesc;

    const t2 = qaCards[2].querySelector('.qa-title');
    const d2 = qaCards[2].querySelector('.qa-desc');
    if (t2) t2.textContent = strings.qaWorksheetTitle;
    if (d2) d2.textContent = strings.qaWorksheetDesc;
  }

  // 7. Recent lessons section header
  const recH3 = document.querySelector('.section-header-line h3');
  if (recH3) recH3.textContent = strings.recentLessons;
  const linkViewAll = document.querySelector('.link-view-all');
  if (linkViewAll) linkViewAll.textContent = strings.viewAll;

  // 8. Student Portal Headings
  const stHeroHeading = document.querySelector('.student-hero-lesson h3');
  if (stHeroHeading && stHeroHeading.textContent?.includes('Animals')) {
    stHeroHeading.textContent = lang === 'Hindi' ? 'जानवर 🐮' : lang === 'Telugu' ? 'జంతువులు 🐮' : lang === 'Ho' ? 'Jontu Ko 🐮' : 'Animals 🐮';
  }
}
