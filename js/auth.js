/* =========================================================================
   EGO-META — Logique des écrans d'authentification
   ========================================================================= */

function showAuthForm(which) {
  ['loginForm', 'signupForm', 'forgotForm', 'activateForm'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(which).classList.remove('hidden');
  document.getElementById('authError').classList.remove('show');
  // Les boutons Google/GitHub n'ont de sens que sur les écrans connexion/inscription.
  document.getElementById('oauthBlock').classList.toggle('hidden', which !== 'loginForm' && which !== 'signupForm');
}

function authError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}

function initAuthScreen() {
  document.getElementById('showSignup').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signupForm'); });
  document.getElementById('showLogin1').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('loginForm'); });
  document.getElementById('showLogin2').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('loginForm'); });
  document.getElementById('showForgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('forgotForm'); });

  document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
    const email = document.getElementById('li_email').value.trim();
    const password = document.getElementById('li_password').value;
    if (!email || !password) return authError('Merci de renseigner votre email et mot de passe.');
    const { error } = await authSignIn(email, password);
    if (error) return authError(traduireErreurAuth(error.message));
    await authRedeemPendingInviteIfAny();
    onLoginSuccess();
  });

  document.getElementById('signupSubmitBtn').addEventListener('click', async () => {
    const invite = document.getElementById('su_invite').value.trim();
    const username = document.getElementById('su_username').value.trim().toLowerCase();
    const displayName = document.getElementById('su_displayname').value.trim();
    const email = document.getElementById('su_email').value.trim();
    const password = document.getElementById('su_password').value;

    if (!invite) return authError("Un code d'invitation est requis pour rejoindre EGO-META.");
    if (!/^[a-z0-9_\.]{3,20}$/.test(username)) return authError('Pseudo invalide (3-20 caractères, lettres/chiffres/_ uniquement).');
    if (!displayName) return authError('Merci de renseigner un nom affiché.');
    if (password.length < 8) return authError('Le mot de passe doit contenir au moins 8 caractères.');

    const { data, error } = await authSignUp(email, password, username, displayName, invite);
    if (error) return authError(traduireErreurAuth(error.message));

    if (data?.session) {
      onLoginSuccess();
    } else {
      toast('Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.', 'success');
      showAuthForm('loginForm');
    }
  });

  document.getElementById('forgotSubmitBtn').addEventListener('click', async () => {
    const email = document.getElementById('fp_email').value.trim();
    if (!email) return authError('Merci de renseigner votre email.');
    const { error } = await authResetPassword(email);
    if (error) return authError(traduireErreurAuth(error.message));
    toast('Email de réinitialisation envoyé (vérifiez vos spams).', 'success');
    showAuthForm('loginForm');
  });

  // Connexion via Google / GitHub (gratuit, géré nativement par Supabase Auth). Fonctionne
  // aussi bien pour créer un compte que pour se connecter à un compte existant — Supabase
  // ne fait pas de distinction. La page est redirigée vers le fournisseur puis revient ici ;
  // checkExistingSession()/onLoginSuccess() prennent le relais au retour.
  document.getElementById('oauthGoogleBtn').addEventListener('click', async () => {
    const { error } = await authSignInWithOAuth('google');
    if (error) authError(traduireErreurAuth(error.message));
  });
  document.getElementById('oauthGithubBtn').addEventListener('click', async () => {
    const { error } = await authSignInWithOAuth('github');
    if (error) authError(traduireErreurAuth(error.message));
  });

  // Activation d'un compte créé sans code d'invitation (typiquement via Google/GitHub) :
  // voir onLoginSuccess() dans app.js, qui redirige ici quand banned_reason === 'invite_required'.
  document.getElementById('activateSubmitBtn').addEventListener('click', async () => {
    const code = document.getElementById('ac_invite').value.trim();
    if (!code) return authError("Merci de renseigner un code d'invitation.");
    const { error } = await activateAccountWithInvite(code);
    if (error) return authError(traduireErreurAuth(error.message));
    toast('Compte activé, bienvenue sur EGO-META !', 'success');
    await onLoginSuccess();
  });
  document.getElementById('activateLogout').addEventListener('click', async (e) => {
    e.preventDefault();
    await authSignOut();
    showAuthForm('loginForm');
  });
}

function traduireErreurAuth(msg) {
  const map = {
    'Invalid login credentials': 'Email ou mot de passe incorrect.',
    'User already registered': 'Un compte existe déjà avec cet email.',
    'Email not confirmed': 'Merci de confirmer votre email avant de vous connecter.'
  };
  return map[msg] || msg;
}

async function checkExistingSession() {
  if (!sbConfigured) return false;
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    await authRedeemPendingInviteIfAny();
    return true;
  }
  return false;
}
