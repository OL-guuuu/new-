window.APP_CONFIG = {
  SITE_NAME: 'المنصة',
  WORKER_URL: 'https://ai-proxy.lassouedeoussama.workers.dev',
  DASHBOARD_PASSWORD: '00000008',

  STORAGE_KEYS: {
    SUPA_URL: 'supa_url_v2',
    SUPA_KEY: 'supa_key_v2',
    USER_ID: 'platform_user_id_v2'
  },

  // يمكنك تركهما فارغين الآن
  // أو وضع Project URL و anon key هنا لاحقًا
  SUPABASE: {
    URL: '',
    ANON_KEY: ''
  },

  PAGES: {
    movies: {
      dbTable: 'shows',
      userTable: 'user_shows',
      contentType: 'مسلسل / فيلم',
      localKey: 'movies_public_v2',
      myLocalKey: 'movies_private_v2',
      filters: {
        all: 'الكل',
        end: '☣️ نهاية العالم',
        spy: '🕵️ تجسس',
        sci: '🛰️ خيال علمي',
        banned: '🛑 ممنوع',
        low: '📉 نادر المشاهدة'
      }
    },

    books: {
      dbTable: 'books',
      userTable: 'user_books',
      contentType: 'كتاب',
      localKey: 'books_public_v2',
      myLocalKey: 'books_private_v2',
      filters: {
        all: 'الكل',
        sci: '🚀 خيال علمي',
        mystery: '🔍 غموض',
        horror: '👻 رعب',
        history: '🏛️ تاريخي',
        philosophy: '🧠 فلسفة',
        fiction: '📖 رواية'
      }
    },

    podcasts: {
      dbTable: 'podcasts',
      userTable: 'user_podcasts',
      contentType: 'بودكاست',
      localKey: 'podcasts_public_v2',
      myLocalKey: 'podcasts_private_v2',
      filters: {
        all: 'الكل',
        sci: '🔬 علوم',
        mystery: '🕵️ جريمة',
        horror: '💻 تكنولوجيا',
        history: '📜 تاريخ',
        philosophy: '🎭 ثقافة',
        fiction: '💼 أعمال'
      }
    }
  }
};
``
