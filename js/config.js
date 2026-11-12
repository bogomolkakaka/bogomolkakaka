// Site settings. Edit this file on GitHub to connect the database (see README.md).
export const CONFIG = {
  // Name in the taskbar and on the desk.
  SITE_NAME: 'bogomolka',

  // Supabase project (Project Settings → API). Leave empty to run in local demo mode.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // One time zone for the whole project: the shared wall changes at midnight here.
  // Keep it equal to the "timezone" row in the site_config table.
  TIMEZONE: 'Europe/Moscow',

  // Shown to buyers until you save contacts in the admin panel.
  CONTACTS: { email: '', telegram: '', instagram: '' }
};
