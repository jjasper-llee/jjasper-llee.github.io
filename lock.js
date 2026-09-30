/* Password gate (Helix Carbon pages). The page body ships AES-GCM encrypted (see
   .private/build_lock.py, kept out of the repo); the password derives the key,
   so the projects are not in the page source until it is entered. */
(function () {
  'use strict';
  var vaultEl = document.getElementById('lb-vault');
  var form = document.getElementById('lb-lock');
  if (!vaultEl || !form || !window.crypto || !crypto.subtle) return;
  var vault = JSON.parse(vaultEl.textContent);
  var input = document.getElementById('lb-pass');
  var msg = document.getElementById('lb-msg');
  var out = document.getElementById('lb-content');
  var KEY = 'lb-pass';

  function bytes(b64) { return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }

  function unlock(pw) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: bytes(vault.salt), iterations: vault.iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      })
      .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(vault.iv) }, key, bytes(vault.ct)); })
      .then(function (buf) {
        out.innerHTML = new TextDecoder().decode(buf);
        (document.getElementById('lb-gate') || form).hidden = true;
        try { sessionStorage.setItem(KEY, pw); } catch (e) {}
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = 'Checking…';
    unlock(input.value).then(function () { msg.textContent = ''; }, function () {
      msg.textContent = 'Incorrect password.';
      input.select();
    });
  });

  var saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch (e) {}
  if (saved) unlock(saved).catch(function () { try { sessionStorage.removeItem(KEY); } catch (e) {} });
})();
