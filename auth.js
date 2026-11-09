/* Yula Kilit üyelik katmanı — Supabase Auth + RLS */
(() => {
  const cfg = window.YULA_SUPABASE_CONFIG || {};
  const configured = cfg.url && cfg.anonKey &&
    !String(cfg.url).includes('BURAYA') && !String(cfg.anonKey).includes('BURAYA');

  const $ = (id) => document.getElementById(id);
  let sb = null;
  let currentUser = null;
  let currentProfile = null;
  let activeUserId = null;
  let profileTimer = null;
  let recoveryMode = false;

  function message(text, isError = false) {
    const el = $('authMessage');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#ff9b87' : '#e8b94e';
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.oldText = button.textContent;
      button.textContent = busyText || 'İşleniyor...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  }

  function showAuth(text = '') {
    $('appShell').hidden = true;
    $('authScreen').hidden = false;
    $('passwordChangeBox').hidden = true;
    $('loginForm').hidden = false;
    $('signupForm').hidden = true;
    $('forgotPasswordButton').hidden = false;
    $('newAccountButton').hidden = false;
    $('backToLoginButton').hidden = true;
    $('adminPanel').hidden = true;
    message(text);
  }

  function showPasswordForm(text) {
    $('appShell').hidden = true;
    $('authScreen').hidden = false;
    $('loginForm').hidden = true;
    $('signupForm').hidden = true;
    $('forgotPasswordButton').hidden = true;
    $('newAccountButton').hidden = true;
    $('backToLoginButton').hidden = true;
    $('passwordChangeBox').hidden = false;
    message(text || 'Devam etmek için yeni bir şifre belirle.');
  }

  function showApp() {
    $('authScreen').hidden = true;
    $('appShell').hidden = false;
    $('accountEmail').textContent = currentUser?.email || '';
    $('adminOpenButton').hidden = currentProfile?.role !== 'admin';
    if (typeof loadVillagesForUser === 'function' && currentUser?.id) {
      loadVillagesForUser(currentUser.id);
    }
    if (currentProfile?.role !== 'admin') $('adminPanel').hidden = true;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  async function loadProfile(user) {
    const { data, error } = await sb
      .from('profiles')
      .select('id,email,role,is_active,force_password_change')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function checkAccess(user, forceReload = false) {
    if (!user) {
      currentUser = null;
      currentProfile = null;
      activeUserId = null;
      if (profileTimer) clearInterval(profileTimer);
      showAuth();
      return;
    }
    if (!forceReload && activeUserId === user.id && currentProfile?.is_active) return;

    currentUser = user;
    let profile;
    try {
      profile = await loadProfile(user);
    } catch (err) {
      console.error('Profil yüklenemedi:', err);
      await sb.auth.signOut();
      showAuth('Üyelik bilgisi okunamadı. Lütfen yöneticiyle iletişime geç.');
      return;
    }

    if (!profile || !profile.is_active) {
      currentProfile = profile;
      await sb.auth.signOut();
      showAuth('Bu hesabın erişimi kapatılmış. Yöneticiyle iletişime geç.');
      return;
    }

    currentProfile = profile;
    activeUserId = user.id;
    if (profile.force_password_change && !recoveryMode) {
      showPasswordForm('Geçici şifre kullanıyorsun. Önce kendi şifreni belirlemelisin.');
    } else if (recoveryMode) {
      showPasswordForm('Yeni şifreni belirle.');
    } else {
      showApp();
    }

    if (profileTimer) clearInterval(profileTimer);
    profileTimer = setInterval(async () => {
      if (!currentUser) return;
      try {
        const latest = await loadProfile(currentUser);
        if (!latest || !latest.is_active) {
          await sb.auth.signOut();
          showAuth('Üyelik erişimin yönetici tarafından kapatıldı.');
        } else {
          currentProfile = latest;
        }
      } catch (err) {
        console.warn('Üyelik kontrolü yapılamadı:', err);
      }
    }, 45000);
  }

  async function callAdmin(body) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (error) {
      let detail = error.message || 'Yönetici işlemi başarısız.';
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) detail = payload.error;
      } catch (_) {}
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function refreshMembers() {
    $('memberList').textContent = 'Üyeler yükleniyor...';
    try {
      const result = await callAdmin({ action: 'list' });
      const users = result.users || [];
      if ($('inviteUsage')) {
        const used = Number(result.invite_used || 0);
        const max = Number(result.invite_max || 30);
        $('inviteUsage').textContent = `Davet kodu kullanımı: ${used}/${max} kayıt`;
      }
      if (!users.length) {
        $('memberList').textContent = 'Henüz üye bulunamadı.';
        return;
      }
      $('memberList').innerHTML = `
        <table class="admin-table"><thead><tr><th>E-posta</th><th>Durum</th><th>İşlem</th></tr></thead>
        <tbody>${users.map((u) => `
          <tr>
            <td>${escapeHTML(u.email)}${u.role === 'admin' ? ' <strong style="color:#e8b94e">Yönetici</strong>' : ''}</td>
            <td>${u.is_active ? 'Aktif' : 'Kapalı'}</td>
            <td>${u.role === 'admin' ? '—' : `<button class="btn secondary member-toggle" type="button" data-id="${escapeHTML(u.id)}" data-active="${u.is_active ? '1' : '0'}">${u.is_active ? 'Kapat' : 'Aç'}</button>`}</td>
          </tr>`).join('')}
        </tbody></table>`;
      document.querySelectorAll('.member-toggle').forEach((button) => {
        button.addEventListener('click', async () => {
          const active = button.dataset.active !== '1';
          button.disabled = true;
          try {
            await callAdmin({ action: 'set_active', user_id: button.dataset.id, is_active: active });
            await refreshMembers();
          } catch (err) {
            alert(err.message);
            button.disabled = false;
          }
        });
      });
    } catch (err) {
      $('memberList').textContent = `Üye listesi alınamadı: ${err.message}`;
    }
  }

  async function login(event) {
    event.preventDefault();
    const button = $('loginButton');
    setBusy(button, true, 'Giriş yapılıyor...');
    message('');
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      });
      if (error) throw error;
      await checkAccess(data.user, true);
    } catch (err) {
      message('Giriş yapılamadı. E-posta ve şifreni kontrol et.', true);
    } finally {
      setBusy(button, false);
    }
  }

  function openSignup() {
    $('loginForm').hidden = true;
    $('signupForm').hidden = false;
    $('forgotPasswordButton').hidden = true;
    $('newAccountButton').hidden = true;
    $('backToLoginButton').hidden = false;
    message('Davet kodunu kullanarak kendi hesabını oluştur. Kod 30 başarılı kayıtla sınırlıdır.');
  }

  function openLogin() {
    $('signupForm').hidden = true;
    $('loginForm').hidden = false;
    $('forgotPasswordButton').hidden = false;
    $('newAccountButton').hidden = false;
    $('backToLoginButton').hidden = true;
    message('');
  }

  async function signup(event) {
    event.preventDefault();
    const email = $('signupEmail').value.trim().toLowerCase();
    const password = $('signupPassword').value;
    const inviteCode = $('signupInviteCode').value.trim().toUpperCase();
    if (password.length < 8) return message('Şifre en az 8 karakter olmalı.', true);
    if (!inviteCode) return message('Davet kodunu gir.', true);

    const button = $('signupButton');
    setBusy(button, true, 'Hesap oluşturuluyor...');
    message('Davet kodu kontrol ediliyor...');
    try {
      const { data: result, error } = await sb.functions.invoke('invite-signup', {
        body: { email, password, invite_code: inviteCode }
      });
      if (error) {
        let detail = error.message || 'Kayıt işlemi başarısız.';
        try {
          const payload = await error.context?.json?.();
          if (payload?.error) detail = payload.error;
        } catch (_) {}
        throw new Error(detail);
      }
      if (result?.error || result?.success !== true) throw new Error(result?.error || 'Kayıt işlemi tamamlanamadı.');

      const { data: loginData, error: loginError } = await sb.auth.signInWithPassword({ email, password });
      if (loginError) {
        openLogin();
        $('loginEmail').value = email;
        message('Hesabın oluşturuldu. Şimdi e-posta ve şifrenle giriş yapabilirsin.');
        return;
      }
      $('signupForm').reset();
      await checkAccess(loginData.user, true);
    } catch (err) {
      message(err.message || 'Kayıt yapılamadı. Bilgilerini kontrol et.', true);
    } finally {
      setBusy(button, false);
    }
  }

  async function forgotPassword() {
    const email = $('loginEmail').value.trim();
    if (!email) {
      message('Şifre sıfırlama bağlantısı için önce e-posta adresini yaz.', true);
      return;
    }
    const button = $('forgotPasswordButton');
    setBusy(button, true, 'Gönderiliyor...');
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      message('Şifre sıfırlama bağlantısı e-posta adresine gönderildi.');
    } catch (err) {
      message(`Bağlantı gönderilemedi: ${err.message}`, true);
    } finally {
      setBusy(button, false);
    }
  }

  async function changePassword() {
    const first = $('newPassword').value;
    const second = $('newPasswordAgain').value;
    if (first.length < 8) return message('Şifre en az 8 karakter olmalı.', true);
    if (first !== second) return message('Şifreler birbiriyle eşleşmiyor.', true);
    const button = $('changePasswordButton');
    setBusy(button, true, 'Kaydediliyor...');
    try {
      const { error } = await sb.auth.updateUser({ password: first });
      if (error) throw error;
      if (currentProfile?.force_password_change) {
        const { error: rpcError } = await sb.rpc('complete_password_change');
        if (rpcError) throw rpcError;
      }
      recoveryMode = false;
      $('newPassword').value = '';
      $('newPasswordAgain').value = '';
      await checkAccess(currentUser, true);
      message('Şifren güncellendi.');
    } catch (err) {
      message(`Şifre güncellenemedi: ${err.message}`, true);
    } finally {
      setBusy(button, false);
    }
  }

  function bindUI() {
    $('loginForm').addEventListener('submit', login);
    $('signupForm').addEventListener('submit', signup);
    $('newAccountButton').addEventListener('click', openSignup);
    $('backToLoginButton').addEventListener('click', openLogin);
    $('forgotPasswordButton').addEventListener('click', forgotPassword);
    $('changePasswordButton').addEventListener('click', changePassword);
    $('logoutButton').addEventListener('click', () => sb.auth.signOut());
    $('adminOpenButton').addEventListener('click', async () => {
      const panel = $('adminPanel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) await refreshMembers();
    });
  }

  async function start() {
    bindUI();
    if (!configured || !window.supabase?.createClient) {
      showAuth('Üyelik sistemi henüz Supabase projesine bağlanmadı. Yönetici kurulum ayarlarını tamamlamalı.');
      $('loginButton').disabled = true;
      $('signupButton').disabled = true;
      $('newAccountButton').disabled = true;
      $('forgotPasswordButton').disabled = true;
      return;
    }

    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.yulaSupabase = sb;

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode = true;
        currentUser = session?.user || null;
        showPasswordForm('Şifre sıfırlama bağlantısını açtın. Yeni şifreni belirle.');
        return;
      }
      if (event === 'SIGNED_OUT') recoveryMode = false;
      // Auth callback içinde Supabase sorgusu başlatmamak için işi sonraki mikro göreve bırak.
      Promise.resolve().then(() => checkAccess(session?.user || null));
    });

    const { data, error } = await sb.auth.getSession();
    if (error) {
      showAuth('Oturum bilgisi okunamadı. Sayfayı yenile.');
      return;
    }
    await checkAccess(data.session?.user || null, true);
  }

  document.addEventListener('DOMContentLoaded', start);
})();
