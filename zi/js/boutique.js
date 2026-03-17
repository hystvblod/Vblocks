/* ===========================
   boutique.js — CLEAN (HTML-first)
   – Aucun rendu DOM : l’HTML garde 100% la main
   – Le JS branche les clics + IAP + soldes + pubs
   =========================== */

(function () {
  'use strict';

  // ---------- i18n helper (optionnel) ----------
  function t(key, params) {
    try {
      if (window.i18nGet) {
        let s = window.i18nGet(key) ?? key;
        if (params) for (const k in params) s = s.replace(`{${k}}`, params[k]);
        return s;
      }
      if (window.I18N_MAP && window.I18N_MAP[key]) {
        let s = window.I18N_MAP[key];
        if (params) for (const k in params) s = s.replace(`{${k}}`, params[k]);
        return s;
      }
    } catch {}
    return key;
  }

  // ---------- IAP / Supabase glue ----------
  const hasRefreshPrices = () => typeof window.refreshDisplayedPrices === 'function';

  async function getVCoinsSupabase() {
    try { return await (window.userData?.getVCoins?.() ?? 0); } catch { return 0; }
  }
  async function getJetonsSupabase() {
    try { return await (window.userData?.getJetons?.() ?? 0); } catch { return 0; }
  }

  // alias attend des valeurs posées dans l’HTML via data-alias :
  //  - points3000, points10000, jetons12, jetons50
  //  - noads
  //  - theme:<clé>  (ex: theme:neon)
  async function acheterAlias(alias) {
    try {
      if (!alias) return;

      if (alias === 'noads') {
        if (typeof window.setNoAds === 'function') await window.setNoAds(true);
        if (window.userData?.setNoAds) await window.userData.setNoAds(true);
        localStorage.setItem('no_ads', '1');
        toastOK(t('achat.noads.ok','Publicités désactivées'));
        return;
      }

      if (alias.startsWith('theme:')) {
        const themeKey = alias.split(':',2)[1];
        // métier côté app (débit VCoins + ajout thème)
        if (typeof window.userData?.purchaseTheme === 'function') {
          const ok = await window.userData.purchaseTheme(themeKey, /* prix fixé côté métier ou lu en HTML */ undefined);
          if (!ok) return;
        } else if (typeof window.acheterTheme === 'function') {
          await window.acheterTheme(themeKey);
        }
        toastOK(t('achat.theme.ok','Thème débloqué'));
        return;
      }

      // Achats “monnaie” via Store
      if (typeof window.lancerPaiement === 'function') {
        const ok = await window.lancerPaiement(alias); // hook éventuel avant order()
        if (!ok) return;
      }
      if (typeof window.safeOrder === 'function') {
        await window.safeOrder(alias);
        toastOK(t('achat.ok','Achat effectué'));
        return;
      }

      // Fallback DEV/Web (sans store) — crédite local si dispo
      if (alias.startsWith('points') && typeof window.userData?.addVCoins === 'function') {
        const n = parseInt(alias.replace('points',''), 10) || 0;
        await window.userData.addVCoins(n);
        toastOK(t('achat.ok','Achat effectué'));
        return;
      }
      if (alias.startsWith('jetons') && typeof window.userData?.addJetons === 'function') {
        const n = parseInt(alias.replace('jetons',''), 10) || 0;
        await window.userData.addJetons(n);
        toastOK(t('achat.ok','Achat effectué'));
        return;
      }

      alert(t('achat.err','Impossible de finaliser l’achat (IAP non disponible).'));
    } catch (e) {
      console.error('[boutique] achat error', e);
      alert(t('achat.err','Impossible de finaliser l’achat.'));
    } finally {
      // MAJ soldes en en-tête (sans toucher au HTML des cartes)
      updateBalancesHeader().catch(()=>{});
      // Si achat.js gère des prix localisés, on peut relancer la màj
      if (hasRefreshPrices()) { try {
        window.refreshDisplayedPrices();
        setTimeout(() => { try { window.refreshDisplayedPrices(); } catch {} }, 1500);
      } catch {}}
    }
  }

  function toastOK(msg) {
    try { if (window.showToast) window.showToast(msg); else console.log('[OK]', msg); } catch {}
  }

  async function updateBalancesHeader() {
    try {
      const [v, j] = await Promise.all([getVCoinsSupabase(), getJetonsSupabase()]);
      document.querySelectorAll('.vcoins-solde').forEach((el, idx) => {
        el.textContent = idx === 0 ? (v ?? 0) : (j ?? 0);
      });
    } catch (e) {
      console.warn('[boutique] balances refresh failed', e);
    }
  }

  // ---------- Bind des clics (HTML -> actions) ----------
  function setupBoutiqueActions() {
    // Toutes les cartes/capsules doivent avoir data-alias en HTML
    // ex: <div class="special-cartouche ..." data-alias="points3000">…</div>
    // ex: <div class="theme-card ..."         data-alias="theme:neon">…</div>
    document.querySelectorAll('[data-alias]').forEach(node => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', async (e) => {
        e.preventDefault();
        const alias = node.getAttribute('data-alias');
        node.classList.add('is-loading');
        try { await acheterAlias(alias); }
        finally { node.classList.remove('is-loading'); }
      }, { passive: false });
    });

    // Pubs récompensées (si présentes en HTML)
    const oneJeton = document.querySelector('[data-action="reward-jeton"]');
    if (oneJeton) oneJeton.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (typeof window.showRewardBoutique === 'function') await window.showRewardBoutique();
      } catch (err) {
        alert(t('pub.err','Publicité indisponible pour le moment.'));
      } finally {
        updateBalancesHeader();
      }
    });

    const threeHundred = document.querySelector('[data-action="reward-vcoins"]');
    if (threeHundred) threeHundred.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (typeof window.showRewardVcoins === 'function') await window.showRewardVcoins();
      } catch (err) {
        alert(t('pub.err','Publicité indisponible pour le moment.'));
      } finally {
        updateBalancesHeader();
      }
    });
  }

  // ---------- Bootstrap (aucun rendu) ----------
  document.addEventListener('DOMContentLoaded', async () => {
    try { setupBoutiqueActions(); } catch (e) { console.warn('[boutique] setup error', e); }

    if (hasRefreshPrices()) {
      try {
        window.refreshDisplayedPrices();
        setTimeout(() => { try { window.refreshDisplayedPrices(); } catch {} }, 1500);
      } catch (e) { console.warn('[boutique] price refresh error', e); }
    }

    await updateBalancesHeader();
  });

})();
