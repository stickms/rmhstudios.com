(function () {
  'use strict';

  function serial() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var ref = document.getElementById('visit-ref');
    if (ref) ref.textContent = 'VIS-2026-0719-' + serial();

    document.querySelectorAll('.redacted').forEach(function (bar) {
      bar.setAttribute('tabindex', '0');
      bar.setAttribute('aria-label', 'Redacted');
      var active = false;
      function note() {
        if (active) return;
        active = true;
        var stamp = document.createElement('span');
        stamp.className = 'noted-stamp';
        stamp.setAttribute('aria-hidden', 'true');
        stamp.textContent = 'NOTED';
        bar.insertAdjacentElement('afterend', stamp);
        setTimeout(function () {
          stamp.remove();
          active = false;
        }, 1600);
      }
      bar.addEventListener('mouseenter', note);
      bar.addEventListener('focus', note);
    });

    var form = document.getElementById('appeal-form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        var name = document.getElementById('appellant-name').value.trim();
        var ref = 'APL-2026-0719-' + serial();
        var when = new Date().toLocaleString('en-US', {
          dateStyle: 'long',
          timeStyle: 'short',
        });
        var receipt = document.createElement('section');
        receipt.className = 'sheet receipt';
        receipt.innerHTML =
          '<p class="sheet-head">RMH PMC · DEPARTMENT OF INTERNAL AFFAIRS · OFFICE OF APPEALS</p>' +
          '<h2>Appeal receipt</h2>' +
          '<dl class="sheet-kv">' +
          '<dt>Reference</dt><dd class="receipt-ref"></dd>' +
          '<dt>Received</dt><dd class="receipt-when"></dd>' +
          '<dt>Appellant</dt><dd class="receipt-name"></dd>' +
          '</dl>' +
          '<p>Your appeal has been received and added to your file. The Department thanks you for identifying yourself. No further action is required on your part. Further action on the Department’s part is neither confirmed nor denied.</p>' +
          '<p class="stamp stamp--red">NOTED</p>' +
          '<p><a class="receipt-again" href="/rmh-internal-affairs/appeal">File another appeal</a></p>';
        receipt.querySelector('.receipt-ref').textContent = ref;
        receipt.querySelector('.receipt-when').textContent = when;
        receipt.querySelector('.receipt-name').textContent = name;
        var wrap = document.getElementById('appeal-wrap');
        wrap.replaceChildren(receipt);
        receipt.setAttribute('tabindex', '-1');
        receipt.focus();
      });
    }
  });
})();
