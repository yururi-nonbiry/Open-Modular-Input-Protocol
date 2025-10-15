import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpApi from 'i18next-http-backend';

i18n
  .use(HttpApi) // Loads translations from a server
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    supportedLngs: ['en', 'ja'],
    fallbackLng: 'en', // Use English if the detected language is not available
    debug: true, // Set to false in production

    // Configure the backend
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json', // Path to translation files
    },

    // Default namespace
    ns: 'translation',
    defaultNS: 'translation',

    interpolation: {
      escapeValue: false, // React already safes from xss
    },
  });

export default i18n;
