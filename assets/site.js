(function () {
  'use strict';

  var CONFIG = {
    // Optional. A form endpoint (Formspree, Getform, a Make or Zapier webhook,
    // or your email tool's form URL) that receives sign-ups and bookings as JSON.
    endpoint: '',
    // Optional. Your payment page (Stripe Payment Link, Razorpay, PayPal).
    // The plan, class and email are added to the link. Leave empty for the demo.
    paymentUrl: '',
    offerHours: 48 // how long the attendee price stays open after sign-up
  };

  // Class times are set in UTC and shown in each visitor's own time zone.
  var FREE_CLASS = { days: [3, 6], hour: 13, minute: 30, minutes: 60 }; // Wed and Sat, 7:00 PM in India
  var LIVE_CLASS = { days: [1, 4], hour: 13, minute: 30, minutes: 60 }; // Mon and Thu
  var TOPICS = [
    { title: 'Small talk without freezing', level: 'Intermediate' },
    { title: 'Pronunciation: the sounds that matter most', level: 'All levels' },
    { title: 'Job interview English', level: 'Intermediate' },
    { title: 'Phrasal verbs you will actually use', level: 'Intermediate' },
    { title: 'Telling a story in the past', level: 'Beginner' },
    { title: 'Meetings and calls at work', level: 'Advanced' }
  ];
  var PLANS = {
    single: { name: 'Single live class', price: 35, note: 'One 60-minute live class' },
    pack: { name: '4-class pack', price: 119, note: 'Any 4 live classes in 8 weeks' },
    course: { name: 'Confident English, 8 weeks', price: 249, was: 299, note: '16 live classes and the Speaking Guide' }
  };
  var KEY = 'emma.signup';
  var OFFER_KEY = 'emma.offerEnds';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var store = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    set: function (v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
    merge: function (v) { this.set(Object.assign(this.get(), v)); }
  };

  // Personal data is never shown in full: emails become XXXX@domain, phones keep the last 2 digits.
  function maskEmail(email) {
    email = String(email || '');
    var at = email.lastIndexOf('@');
    return at > 0 ? 'XXXX' + email.slice(at) : 'XXXX@XXXX.com';
  }
  function maskPhone(code, number) {
    var d = String(number || '').replace(/\D/g, '');
    if (!d) return '';
    return (code ? code + ' ' : '') + new Array(Math.max(d.length - 1, 5)).join('X') + d.slice(-2);
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function send(data) {
    if (!CONFIG.endpoint || !window.fetch) return Promise.resolve();
    var req = fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ sentAt: new Date().toISOString(), page: location.pathname }, data)),
      keepalive: true
    }).catch(function () {});
    return Promise.race([req, wait(4000)]);
  }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function money(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0 }); }

  /* ---------- class times ---------- */

  function upcoming(rule, count, from) {
    var out = [];
    var d = new Date(from || Date.now());
    d.setUTCHours(rule.hour, rule.minute, 0, 0);
    for (var i = 0; out.length < count && i < 60; i++) {
      var t = new Date(d.getTime() + i * 864e5);
      if (rule.days.indexOf(t.getUTCDay()) > -1 && t.getTime() > Date.now() + 2 * 36e5) out.push(t);
    }
    return out;
  }
  function idOf(prefix, date) { return prefix + date.toISOString().slice(0, 10).replace(/-/g, ''); }

  function freeSessions() {
    return upcoming(FREE_CLASS, 3).map(function (d) { return { id: idOf('f', d), start: d }; });
  }
  function liveClasses() {
    return upcoming(LIVE_CLASS, TOPICS.length, Date.now() + 2 * 864e5).map(function (d, i) {
      var seats = 2 + ((d.getUTCDate() * 7 + i * 3) % 8);
      return Object.assign({ id: idOf('c', d), start: d, seats: seats }, TOPICS[i]);
    });
  }
  function findClass(id) {
    return liveClasses().filter(function (c) { return c.id === id; })[0] || null;
  }

  var tzName = (function () {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date());
      return (p.filter(function (x) { return x.type === 'timeZoneName'; })[0] || {}).value || '';
    } catch (e) { return ''; }
  })();
  function fmtDay(d) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function fmtWhen(d) { return fmtDay(d) + ', ' + fmtTime(d) + (tzName ? ' (' + tzName + ')' : ''); }

  /* ---------- shared ---------- */

  function initCommon() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

    var toggle = $('[data-nav-toggle]');
    var menu = $('[data-mobile-nav]');
    if (toggle && menu) {
      var setMenu = function (open) {
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        $('use', toggle).setAttribute('href', open ? '#i-x' : '#i-menu');
      };
      toggle.addEventListener('click', function () { setMenu(menu.hidden); });
      $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); } });
    }

    var next = freeSessions()[0];
    $$('[data-next-free]').forEach(function (el) { el.textContent = fmtWhen(next.start); });
    $$('[data-tz]').forEach(function (el) { el.textContent = tzName || 'your local time'; });

    $$('[data-video]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var frame = document.createElement('iframe');
        frame.src = btn.getAttribute('data-embed');
        frame.title = btn.getAttribute('data-title') || 'Video';
        frame.allow = 'accelerometer; autoplay; encrypted-media; fullscreen; gyroscope; picture-in-picture';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.setAttribute('allowfullscreen', '');
        btn.parentNode.replaceChild(frame, btn);
        frame.focus();
      });
    });

    renderClasses();
  }

  function renderClasses() {
    $$('[data-classes]').forEach(function (list) {
      var limit = +list.getAttribute('data-classes') || TOPICS.length;
      list.innerHTML = liveClasses().slice(0, limit).map(function (c) {
        var low = c.seats <= 3;
        return '<li class="class-row">' +
          '<span class="class-date"><span>' + c.start.toLocaleDateString('en-GB', { month: 'short' }) + '</span><b>' + c.start.getDate() + '</b></span>' +
          '<div class="class-info"><h3>' + c.title + '</h3>' +
          '<p>' + c.start.toLocaleDateString('en-GB', { weekday: 'long' }) + ', ' + fmtTime(c.start) + (tzName ? ' ' + tzName : '') + ' · 60 min · on Zoom</p>' +
          '<p class="class-tags"><span class="tag">' + c.level + '</span><span class="tag' + (low ? ' low' : '') + '">' + c.seats + ' of 12 seats left</span></p></div>' +
          '<div class="class-book"><span class="price">$35</span><a class="btn btn-amber" href="checkout.html?plan=single&amp;class=' + c.id + '">Book</a></div>' +
          '</li>';
      }).join('');
    });
  }

  function offerEnds() {
    var t = 0;
    try { t = +localStorage.getItem(OFFER_KEY) || 0; } catch (e) {}
    if (!t || t < Date.now() - 864e5 * 7) {
      var reg = store.get();
      t = (reg.registeredAt || Date.now()) + CONFIG.offerHours * 36e5;
      try { localStorage.setItem(OFFER_KEY, String(t)); } catch (e) {}
    }
    return t;
  }
  function runTimer(root) {
    var ends = offerEnds();
    var h = $('[data-h]', root), m = $('[data-m]', root), s = $('[data-s]', root);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var tick = function () {
      var left = Math.max(0, ends - Date.now());
      h.textContent = pad(Math.floor(left / 36e5));
      m.textContent = pad(Math.floor(left / 6e4) % 60);
      s.textContent = pad(Math.floor(left / 1e3) % 60);
      if (!left) {
        clearInterval(id);
        $$('[data-offer-open]').forEach(function (el) { el.hidden = true; });
        $$('[data-offer-closed]').forEach(function (el) { el.hidden = false; });
      }
    };
    var id = setInterval(tick, 1000);
    tick();
  }

  /* ---------- landing page ---------- */

  function initHome() {
    var bar = $('[data-mobile-cta]');
    var hero = $('[data-hero]');
    var reg = $('#register');
    if (bar && hero && reg && 'IntersectionObserver' in window) {
      var heroOut = false, regIn = false;
      var update = function () { bar.classList.toggle('show', heroOut && !regIn); };
      new IntersectionObserver(function (e) { heroOut = !e[0].isIntersecting; update(); }).observe(hero);
      new IntersectionObserver(function (e) { regIn = e[0].isIntersecting; update(); }).observe(reg);
    }

    var box = $('[data-free-sessions]');
    if (box) {
      box.innerHTML = freeSessions().map(function (s, i) {
        return '<label class="choice"><input type="radio" name="session" value="' + s.id + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span><b>' + fmtDay(s.start) + '</b><small>' + fmtTime(s.start) + (tzName ? ' ' + tzName : '') + ' · 60 min</small></span></label>';
      }).join('');
    }

    var form = $('#reg-form');
    if (!form) return;
    liveCheck(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkAll(form)) return;
      if (form.website.value) { location.href = 'watch.html'; return; }
      var data = formData(form);
      var s = freeSessions().filter(function (x) { return x.id === data.session; })[0] || freeSessions()[0];
      data.sessionLabel = fmtWhen(s.start);
      data.sessionStart = s.start.getTime();
      data.registeredAt = Date.now();
      data.type = 'webinar';
      store.merge(data);
      try { localStorage.removeItem(OFFER_KEY); } catch (err) {}
      var btn = $('button[type=submit]', form);
      btn.disabled = true;
      btn.firstChild.textContent = 'Saving your seat… ';
      Promise.all([send(data), wait(600)]).then(function () { location.href = 'watch.html'; });
    });
  }

  /* ---------- webinar room ---------- */

  function initWatch() {
    var reg = store.get();
    if (reg.firstName) $$('[data-first-name]').forEach(function (el) { el.textContent = reg.firstName; });
    else $$('[data-name-wrap]').forEach(function (el) { el.hidden = true; });
    var label = reg.sessionLabel || fmtWhen(freeSessions()[0].start);
    $$('[data-session]').forEach(function (el) { el.textContent = label; });
    if (reg.email) $$('[data-masked-email]').forEach(function (el) { el.textContent = maskEmail(reg.email); });
    else $$('[data-email-wrap]').forEach(function (el) { el.hidden = true; });
    $$('[data-timer]').forEach(runTimer);
  }

  /* ---------- offer page ---------- */

  function initOffer() {
    $$('[data-timer]').forEach(runTimer);
    var ends = new Date(offerEnds());
    $$('[data-offer-date]').forEach(function (el) { el.textContent = fmtWhen(ends); });
  }

  /* ---------- checkout ---------- */

  function initCheckout() {
    var form = $('#checkout-form');
    if (!form) return;
    var reg = store.get();
    if (Date.now() > offerEnds()) {
      PLANS.course = { name: PLANS.course.name, price: PLANS.course.was, note: PLANS.course.note };
      $$('[data-course-price]').forEach(function (el) { el.textContent = money(PLANS.course.price); });
    }
    var planId = PLANS[param('plan')] ? param('plan') : 'course';
    var classId = param('class');

    $$('input[name=plan]', form).forEach(function (r) { r.checked = r.value === planId; });

    var classSel = form.elements.classId;
    classSel.innerHTML = liveClasses().map(function (c) {
      return '<option value="' + c.id + '">' + fmtDay(c.start) + ', ' + fmtTime(c.start) + ' · ' + c.title + '</option>';
    }).join('');
    if (classId && findClass(classId)) classSel.value = classId;

    var startSel = form.elements.startDate;
    startSel.innerHTML = upcoming({ days: [1], hour: 13, minute: 30 }, 3, Date.now() + 2 * 864e5).map(function (d) {
      return '<option value="' + idOf('s', d) + '" data-label="' + fmtDay(d) + '">Monday ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) + '</option>';
    }).join('');

    if (reg.firstName && !form.elements.firstName.value) form.elements.firstName.value = reg.firstName;
    if (reg.email && !form.elements.email.value) form.elements.email.value = reg.email;
    if (reg.level) form.elements.level.value = reg.level;

    var update = function () {
      var id = (form.querySelector('input[name=plan]:checked') || {}).value || 'course';
      var p = PLANS[id];
      $('[data-pick-class]').hidden = id !== 'single';
      $('[data-pick-start]').hidden = id === 'single';
      $('[data-sum-plan]').textContent = p.name;
      $('[data-sum-note]').textContent = p.note;
      var when = id === 'single' ? classSel.options[classSel.selectedIndex].text : 'Starts ' + startSel.options[startSel.selectedIndex].text;
      $('[data-sum-when]').textContent = when;
      $('[data-sum-was]').hidden = !p.was;
      if (p.was) $('[data-sum-was]').lastElementChild.textContent = '−' + money(p.was - p.price);
      $('[data-sum-total]').textContent = money(p.price);
      $('[data-pay-label]').textContent = 'Pay ' + money(p.price) + ' and book';
    };
    form.addEventListener('change', update);
    update();

    liveCheck(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkAll(form)) return;
      var data = formData(form);
      var p = PLANS[data.plan];
      var c = findClass(data.classId);
      data.planName = p.name;
      data.price = p.price;
      data.whenLabel = data.plan === 'single' && c ? fmtWhen(c.start) : 'Monday course start, ' + startSel.options[startSel.selectedIndex].getAttribute('data-label');
      data.classTitle = data.plan === 'single' && c ? c.title : 'Week 1: Speaking with confidence';
      data.classStart = data.plan === 'single' && c ? c.start.getTime() : +new Date(startSel.value.replace(/^s(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3T13:30:00Z'));
      data.type = 'booking';
      data.bookedAt = Date.now();
      store.merge({ booking: data, firstName: data.firstName, email: data.email });
      var overlay = $('[data-overlay]');
      if (overlay) overlay.hidden = false;
      Promise.all([send(data), wait(900)]).then(function () {
        if (CONFIG.paymentUrl) {
          var u = new URL(CONFIG.paymentUrl);
          u.searchParams.set('plan', data.plan);
          u.searchParams.set('prefilled_email', data.email);
          location.href = u.toString();
        } else location.href = 'confirmed.html';
      });
    });
  }

  /* ---------- booking confirmed ---------- */

  function initConfirmed() {
    var data = store.get();
    var b = data.booking;
    var view = b ? 'booked' : 'none';
    $$('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    if (!b) return;
    $$('[data-first-name]').forEach(function (el) { el.textContent = b.firstName; });
    $$('[data-masked-email]').forEach(function (el) { el.textContent = maskEmail(b.email); });
    var phone = maskPhone(b.phoneCode, b.phone);
    $$('[data-masked-phone]').forEach(function (el) { el.textContent = phone; });
    if (!phone) $$('[data-phone-wrap]').forEach(function (el) { el.hidden = true; });
    $$('[data-plan]').forEach(function (el) { el.textContent = b.planName + ' · ' + money(b.price); });
    $$('[data-when]').forEach(function (el) { el.textContent = b.whenLabel; });
    $$('[data-class-title]').forEach(function (el) { el.textContent = b.classTitle; });

    var cal = $('[data-ics]');
    if (cal && b.classStart) {
      var start = new Date(b.classStart), end = new Date(b.classStart + 36e5);
      var z = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Learn English with Emma//Booking//EN', 'BEGIN:VEVENT',
        'UID:' + b.bookedAt + '@learnenglishwithemma', 'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(start), 'DTEND:' + z(end),
        'SUMMARY:English class with Emma: ' + b.classTitle, 'DESCRIPTION:The Zoom link is in your confirmation email.',
        'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      cal.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    }
  }

  /* ---------- form helpers ---------- */

  function formData(form) {
    var out = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name || el.name === 'website') return;
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value.trim();
    });
    return out;
  }

  function checkField(field) {
    if (field.closest('[hidden]')) { field.classList.remove('has-error'); return true; }
    var msg = '';
    var radios = $$('input[type=radio]', field);
    var el;
    if (radios.length) {
      el = radios[0];
      if (field.hasAttribute('data-required') && !radios.some(function (r) { return r.checked; })) msg = field.getAttribute('data-msg') || 'Please choose one.';
    } else {
      el = $('input[type=tel]', field) || $('input:not([type=radio]), select, textarea', field);
      if (!el) return true;
      var val = el.type === 'checkbox' ? el.checked : el.value.trim();
      if (el.required && !val) msg = el.getAttribute('data-msg') || 'Please fill this in.';
      else if (val && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) msg = 'Please enter a valid email, like name@example.com.';
      else if (val && el.type === 'tel') {
        var digits = val.replace(/\D/g, '').length;
        if (digits < 6 || digits > 14 || /[^\d\s()+-]/.test(val)) msg = 'Please enter a valid phone number.';
      }
    }
    var err = $('.err', field);
    field.classList.toggle('has-error', !!msg);
    if (err) {
      err.textContent = msg;
      if (!err.id) err.id = 'err-' + Math.random().toString(36).slice(2, 8);
    }
    (radios.length ? radios : [el]).forEach(function (t) {
      if (msg) { t.setAttribute('aria-invalid', 'true'); if (err) t.setAttribute('aria-describedby', err.id); }
      else t.removeAttribute('aria-invalid');
    });
    return !msg;
  }

  function checkAll(root) {
    var first = null;
    $$('.field', root).forEach(function (f) { if (!checkField(f) && !first) first = f; });
    if (first) {
      var target = $('[aria-invalid]', first);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, 250);
      return false;
    }
    return true;
  }

  function liveCheck(root) {
    ['input', 'change'].forEach(function (type) {
      root.addEventListener(type, function (e) {
        var f = e.target.closest('.field');
        if (f && f.classList.contains('has-error')) checkField(f);
      });
    });
  }

  /* ---------- boot ---------- */

  function boot() {
    initCommon();
    var page = document.body.getAttribute('data-page');
    if (page === 'home') initHome();
    if (page === 'watch') initWatch();
    if (page === 'offer') initOffer();
    if (page === 'checkout') initCheckout();
    if (page === 'confirmed') initConfirmed();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
