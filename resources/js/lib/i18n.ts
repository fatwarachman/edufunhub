import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import ar from '../locales/ar.json';
import englishAuth from '../locales/en-auth.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import indonesianAuth from '../locales/id-auth.json';

const resources = {
    id: { translation: indonesianAuth },
    en: { translation: { ...en, ...englishAuth } },
    fr: { translation: fr },
    es: { translation: es },
    ar: { translation: ar },
};

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        lng: 'id',
        fallbackLng: 'en',
        supportedLngs: ['id', 'en', 'fr', 'es', 'ar'],
        defaultNS: 'translation',
        ns: 'translation',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
    });

export default i18n;
