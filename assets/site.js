(function () {
  'use strict';

  var CONFIG = {
    // Optional. A form endpoint (Formspree, Getform, a Make or Zapier webhook,
    // or your email tool's form URL) that receives sign-ups and bookings as JSON.
    endpoint: '',
    // Optional. One payment link per plan (Stripe Payment Links, Razorpay or PayPal).
    // "course" is the $249 attendee price, "courseFull" the $299 price. A booking
    // reference and the student's email are added to the link. With no link,
    // checkout goes straight to the confirmation page.
    paymentLinks: { single: '', pack: '', course: '', courseFull: '' },
    offerHours: 48 // the attendee price stays open this long after the free class ends
  };

  // Class times are set in UTC and shown in each visitor's own time zone.
  var FREE_CLASS = { days: [3, 6], hour: 13, minute: 30 };   // Wed and Sat, 7:00 PM in India
  var LIVE_CLASS = { days: [1, 4], hour: 13, minute: 30 };   // Mon and Thu
  var COURSE_START = { days: [1], hour: 13, minute: 30 };    // a new course group every Monday
  // Live class topics rotate in this order, counted from the class on Monday 5 January 2026.
  var FIRST_CLASS = Date.UTC(2026, 0, 5, 13, 30);
  var TOPICS = [
    { title: 'Small talk without freezing', level: 'Intermediate' },
    { title: 'Pronunciation: the sounds that matter most', level: 'All levels' },
    { title: 'Job interview English', level: 'Intermediate' },
    { title: 'Phrasal verbs you will actually use', level: 'Intermediate' },
    { title: 'Telling a story in the past', level: 'Beginner' },
    { title: 'Meetings and calls at work', level: 'Advanced' }
  ];
  var COURSE_WEEK_1 = 'Week 1: Speaking without translating';
  var PLANS = {
    single: { name: 'Single live class', price: 35, note: 'One 60-minute live class' },
    pack: { name: '4-class pack', price: 119, note: 'Any 4 live classes in 8 weeks' },
    course: { name: 'Confident English, 8 weeks', price: 299, attendee: 249, note: '16 live classes and the Speaking Guide' }
  };
  var SIGNUP_KEY = 'emma.signup';
  var BOOKING_KEY = 'emma.booking';
  var OFFER_KEY = 'emma.offerEnds';
  var HOUR = 36e5, DAY = 864e5;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function load(type, key) { try { return JSON.parse(window[type].getItem(key)) || {}; } catch (e) { return {}; } }
  function save(type, key, value) { try { window[type].setItem(key, JSON.stringify(value)); } catch (e) {} }
  // The free class sign-up is kept for 30 days so the class page works in any tab.
  function signup() {
    var s = load('localStorage', SIGNUP_KEY);
    return s.registeredAt && s.registeredAt > Date.now() - 30 * DAY ? s : {};
  }

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
  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function money(n) { return '$' + (n % 1 ? n.toFixed(2) : String(n)); }

  /* ---------- class times ---------- */

  // Bookings close 2 hours before a class starts.
  function bookable(t) { return t.getTime() > Date.now() + 2 * HOUR; }
  function upcoming(rule, count) {
    var out = [];
    var d = new Date();
    d.setUTCHours(rule.hour, rule.minute, 0, 0);
    for (var i = 0; out.length < count && i < 70; i++) {
      var t = new Date(d.getTime() + i * DAY);
      if (rule.days.indexOf(t.getUTCDay()) > -1 && bookable(t)) out.push(t);
    }
    return out;
  }
  function idOf(prefix, date) { return prefix + date.toISOString().slice(0, 10).replace(/-/g, ''); }
  function dateFromId(id, prefix, rule) {
    var m = new RegExp('^' + prefix + '(\\d{4})(\\d{2})(\\d{2})$').exec(id || '');
    if (!m) return null;
    var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], rule.hour, rule.minute));
    return rule.days.indexOf(t.getUTCDay()) > -1 && bookable(t) && t - Date.now() < 70 * DAY ? t : null;
  }

  function freeSessions() {
    return upcoming(FREE_CLASS, 3).map(function (d) { return { id: idOf('f', d), start: d }; });
  }
  function classAt(t) {
    var n = Math.round((t.getTime() - FIRST_CLASS) / DAY);
    var slot = Math.floor(n / 7) * 2 + (n % 7 === 3 ? 1 : 0); // two classes a week
    var topic = TOPICS[((slot % TOPICS.length) + TOPICS.length) % TOPICS.length];
    return { id: idOf('c', t), start: t, title: topic.title, level: topic.level, seats: 2 + ((slot * 5 + 3) % 9) };
  }
  function liveClasses(count) { return upcoming(LIVE_CLASS, count).map(classAt); }
  function findClass(id) {
    var t = dateFromId(id, 'c', LIVE_CLASS);
    return t ? classAt(t) : null;
  }

  function zoneOf(d) {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d);
      return (p.filter(function (x) { return x.type === 'timeZoneName'; })[0] || {}).value || '';
    } catch (e) { return ''; }
  }
  function fmtDay(d) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function fmtTimeZone(d) { var z = zoneOf(d); return fmtTime(d) + (z ? ' ' + z : ''); }
  function fmtWhen(d) { var z = zoneOf(d); return fmtDay(d) + ', ' + fmtTime(d) + (z ? ' (' + z + ')' : ''); }
  // Weekday names in the visitor's own zone, like "Wed and Sat, 7:00 PM".
  function daysLabel(rule) {
    var dates = upcoming(rule, rule.days.length * 2);
    var names = {};
    dates.forEach(function (d) { names[d.getDay()] = d.toLocaleDateString('en-GB', { weekday: 'short' }); });
    var list = [1, 2, 3, 4, 5, 6, 0].filter(function (k) { return has(names, k); }).map(function (k) { return names[k]; });
    return list.join(' and ') + (dates[0] ? ', ' + fmtTime(dates[0]) : '');
  }

  /* ---------- attendee price ---------- */

  function offerEnds() { try { return +localStorage.getItem(OFFER_KEY) || 0; } catch (e) { return 0; } }
  function setOfferEnds(t) { try { localStorage.setItem(OFFER_KEY, String(t)); } catch (e) {} }
  function attendeePrice() { return offerEnds() > Date.now(); }
  // The countdown only shows in the last 48 hours; before the class we show the end date.
  function offerSoon() { return offerEnds() - Date.now() <= CONFIG.offerHours * HOUR; }
  function coursePrice() { return attendeePrice() ? PLANS.course.attendee : PLANS.course.price; }

  // Every course price on the page follows the attendee price: $249 while it's open, $299 after.
  function applyPricing() {
    var on = attendeePrice();
    var price = coursePrice();
    $$('[data-course-price]').forEach(function (el) { el.textContent = money(price); });
    $$('[data-course-was]').forEach(function (el) { el.hidden = !on; });
    $$('[data-course-each]').forEach(function (el) { el.textContent = money(Math.round(price / 16 * 10) / 10); });
    $$('[data-offer-open]').forEach(function (el) { el.hidden = !on; });
    $$('[data-offer-closed]').forEach(function (el) { el.hidden = on; });
    $$('[data-offer-soon]').forEach(function (el) { el.hidden = !offerSoon(); });
    $$('[data-offer-later]').forEach(function (el) { el.hidden = offerSoon(); });
    if (on) $$('[data-offer-date]').forEach(function (el) { el.textContent = fmtWhen(new Date(offerEnds())); });
  }

  function runTimer(root) {
    var h = $('[data-h]', root), m = $('[data-m]', root), s = $('[data-s]', root);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var id, soon = offerSoon();
    var tick = function () {
      var left = Math.max(0, offerEnds() - Date.now());
      if (soon !== offerSoon()) { soon = !soon; applyPricing(); }
      h.textContent = pad(Math.floor(left / HOUR));
      m.textContent = pad(Math.floor(left / 6e4) % 60);
      s.textContent = pad(Math.floor(left / 1e3) % 60);
      if (!left) { clearInterval(id); applyPricing(); }
    };
    id = setInterval(tick, 1000);
    tick();
  }

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

    // People who arrive from the after-class email keep the attendee price on any device.
    if (param('attendee') === '1' && !offerEnds()) setOfferEnds(Date.now() + CONFIG.offerHours * HOUR);

    var next = freeSessions()[0];
    $$('[data-next-free]').forEach(function (el) { el.textContent = fmtWhen(next.start); });
    $$('[data-tz]').forEach(function (el) { el.textContent = zoneOf(new Date()) || 'your local time'; });
    $$('[data-days]').forEach(function (el) { el.textContent = daysLabel(el.getAttribute('data-days') === 'free' ? FREE_CLASS : LIVE_CLASS); });

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
    applyPricing();
    $$('[data-timer]').forEach(runTimer);

    // Pages restored with the Back button (back/forward cache) get their buttons back.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      $$('[data-overlay]').forEach(function (el) { el.hidden = true; });
      $$('button[type=submit][data-label]').forEach(function (b) { b.disabled = false; b.firstChild.textContent = b.getAttribute('data-label'); });
    });
  }

  function renderClasses() {
    $$('[data-classes]').forEach(function (list) {
      list.innerHTML = liveClasses(+list.getAttribute('data-classes') || 6).map(function (c) {
        var low = c.seats <= 3;
        return '<li class="class-row">' +
          '<span class="class-date"><span>' + c.start.toLocaleDateString('en-GB', { month: 'short' }) + '</span><b>' + c.start.getDate() + '</b></span>' +
          '<div class="class-info"><h3>' + c.title + '</h3>' +
          '<p>' + c.start.toLocaleDateString('en-GB', { weekday: 'long' }) + ', ' + fmtTimeZone(c.start) + ' · 60 min · on Zoom</p>' +
          '<p class="class-tags"><span class="tag">' + c.level + '</span><span class="tag' + (low ? ' low' : '') + '">' + c.seats + ' of 12 seats left</span></p></div>' +
          '<div class="class-book"><span class="price">$35</span><a class="btn btn-amber" href="checkout.html?plan=single&amp;class=' + c.id + '">Book</a></div>' +
          '</li>';
      }).join('');
    });
  }

  function busy(btn, text) {
    if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', btn.firstChild.textContent);
    btn.disabled = true;
    btn.firstChild.textContent = text;
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
    var renderSessions = function (keep) {
      box.innerHTML = freeSessions().map(function (s, i) {
        var checked = keep ? s.id === keep : i === 0;
        return '<label class="choice"><input type="radio" name="session" value="' + s.id + '"' + (checked ? ' checked' : '') + '>' +
          '<span><b>' + fmtDay(s.start) + '</b><small>' + fmtTimeZone(s.start) + ' · 60 min</small></span></label>';
      }).join('');
    };
    if (box) renderSessions();

    var form = $('#reg-form');
    if (!form) return;
    liveCheck(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkAll(form)) return;
      if (form.website.value) { location.href = 'watch.html'; return; }
      var data = formData(form);
      var s = freeSessions().filter(function (x) { return x.id === data.session; })[0];
      if (!s) {
        // The chosen class started while the form was open.
        renderSessions();
        var field = box.closest('.field');
        field.classList.add('has-error');
        $('.err', field).textContent = 'That class has just started. Please pick another time.';
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      data.sessionStart = s.start.getTime();
      data.registeredAt = Date.now();
      data.type = 'webinar';
      save('localStorage', SIGNUP_KEY, data);
      setOfferEnds(data.sessionStart + HOUR + CONFIG.offerHours * HOUR);
      busy($('button[type=submit]', form), 'Saving your seat… ');
      Promise.all([send(data), wait(600)]).then(function () { location.href = 'watch.html'; });
    });
  }

  /* ---------- webinar room ---------- */

  function initWatch() {
    var reg = signup();
    var view = reg.sessionStart ? 'registered' : 'none';
    $$('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
    if (!reg.sessionStart) return;
    var start = new Date(reg.sessionStart);
    var past = Date.now() > reg.sessionStart + HOUR;
    var name = reg.firstName ? ', ' + reg.firstName : '';
    $$('[data-room-title]').forEach(function (el) { el.textContent = (past ? 'Thanks for joining' : "You're in") + name + '.'; });
    $$('[data-session]').forEach(function (el) { el.textContent = fmtWhen(start) + (past ? ' (finished)' : ''); });
    if (reg.email) $$('[data-masked-email]').forEach(function (el) { el.textContent = maskEmail(reg.email); });
    else $$('[data-email-wrap]').forEach(function (el) { el.hidden = true; });
  }

  /* ---------- checkout ---------- */

  function initCheckout() {
    var form = $('#checkout-form');
    if (!form) return;
    var reg = signup();
    var planId = has(PLANS, param('plan')) ? param('plan') : 'course';
    var classId = param('class');

    $$('input[name=plan]', form).forEach(function (r) { r.checked = r.value === planId; });

    var classSel = form.elements.classId;
    classSel.innerHTML = liveClasses(8).map(function (c) {
      return '<option value="' + c.id + '">' + fmtDay(c.start) + ', ' + fmtTime(c.start) + ' · ' + c.title + '</option>';
    }).join('');
    if (classId) {
      if (findClass(classId) && $('option[value="' + classId + '"]', classSel)) classSel.value = classId;
      else $('[data-class-note]').hidden = false;
    }

    var startSel = form.elements.startDate;
    startSel.innerHTML = upcoming(COURSE_START, 3).map(function (d) {
      return '<option value="' + idOf('s', d) + '">' + fmtWhen(d) + '</option>';
    }).join('');

    if (reg.firstName && !form.elements.firstName.value) form.elements.firstName.value = reg.firstName;
    if (reg.email && !form.elements.email.value) form.elements.email.value = reg.email;
    if (reg.level && !form.elements.level.value) form.elements.level.value = reg.level;

    var current = function () { return (form.querySelector('input[name=plan]:checked') || {}).value || 'course'; };
    var price = function (id) { return id === 'course' ? coursePrice() : PLANS[id].price; };
    var update = function () {
      var id = current();
      var p = PLANS[id];
      var classText = classSel.options[classSel.selectedIndex] ? classSel.options[classSel.selectedIndex].text : '';
      $('[data-pick-class]').hidden = id === 'course';
      $('[data-pick-start]').hidden = id !== 'course';
      $('[data-class-label]').textContent = id === 'pack' ? 'Your first class' : 'Choose your class';
      $('[data-sum-plan]').textContent = p.name;
      $('[data-sum-note]').textContent = p.note;
      $('[data-sum-when]').textContent = id === 'course' ? 'Starts ' + startSel.options[startSel.selectedIndex].text : (id === 'pack' ? 'First class: ' : '') + classText;
      var discount = id === 'course' && attendeePrice();
      $('[data-sum-was]').hidden = !discount;
      if (discount) $('[data-sum-was]').lastElementChild.textContent = '−' + money(PLANS.course.price - PLANS.course.attendee);
      $('[data-sum-total]').textContent = money(price(id));
      $('[data-pay-label]').textContent = 'Pay ' + money(price(id)) + ' and book';
    };
    form.addEventListener('change', update);
    update();

    liveCheck(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkAll(form)) return;
      var data = formData(form);
      var plan = PLANS[data.plan];
      var start;
      if (data.plan === 'course') {
        start = dateFromId(data.startDate, 's', COURSE_START);
        data.classTitle = COURSE_WEEK_1;
      } else {
        var c = findClass(data.classId);
        if (c) { start = c.start; data.classTitle = c.title; }
      }
      if (!start) {
        // The chosen date closed while the form was open.
        var field = (data.plan === 'course' ? startSel : classSel).closest('.field');
        field.classList.add('has-error');
        $('.err', field).textContent = 'That date has just closed. Please pick another one.';
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      delete data[data.plan === 'course' ? 'classId' : 'startDate'];
      data.planName = plan.name;
      data.price = price(data.plan);
      data.classStart = start.getTime();
      data.reference = data.plan + '-' + idOf('', start);
      data.type = 'booking';
      data.bookedAt = Date.now();
      save('sessionStorage', BOOKING_KEY, data);
      var overlay = $('[data-overlay]');
      if (overlay) overlay.hidden = false;
      busy($('button[type=submit]', form), 'Opening payment… ');
      Promise.all([send(data), wait(900)]).then(function () {
        var link = CONFIG.paymentLinks[data.plan === 'course' && !attendeePrice() ? 'courseFull' : data.plan];
        if (link) {
          try {
            var u = new URL(link);
            u.searchParams.set('client_reference_id', data.reference);
            u.searchParams.set('prefilled_email', data.email);
            location.href = u.toString();
            return;
          } catch (err) { /* not a full https link: fall back to the confirmation page */ }
        }
        location.href = 'confirmed.html';
      });
    });
  }

  /* ---------- booking confirmed ---------- */

  function icsText(s) { return String(s).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); }
  function icsFold(line) {
    var out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  }

  function initConfirmed() {
    var b = load('sessionStorage', BOOKING_KEY);
    var booked = !!b.classStart;
    $$('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== (booked ? 'booked' : 'none'); });
    if (!booked) return;
    var start = new Date(b.classStart);
    $$('[data-first-name]').forEach(function (el) { el.textContent = b.firstName; });
    $$('[data-masked-email]').forEach(function (el) { el.textContent = maskEmail(b.email); });
    var phone = maskPhone(b.phoneCode, b.phone);
    $$('[data-masked-phone]').forEach(function (el) { el.textContent = phone; });
    if (!phone) $$('[data-phone-wrap]').forEach(function (el) { el.hidden = true; });
    $$('[data-plan]').forEach(function (el) { el.textContent = b.planName + ' · ' + money(b.price); });
    $$('[data-when]').forEach(function (el) { el.textContent = fmtWhen(start); });
    $$('[data-class-title]').forEach(function (el) { el.textContent = b.classTitle; });

    var cal = $('[data-ics]');
    if (cal) {
      var z = function (d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Learn English with Emma//Booking//EN', 'BEGIN:VEVENT',
        'UID:' + b.reference + '-' + b.bookedAt + '@learnenglishwithemma', 'DTSTAMP:' + z(new Date()),
        'DTSTART:' + z(start), 'DTEND:' + z(new Date(b.classStart + HOUR)),
        'SUMMARY:' + icsText('English class with Emma: ' + b.classTitle),
        'DESCRIPTION:' + icsText('The Zoom link is in your confirmation email.'),
        'END:VEVENT', 'END:VCALENDAR'];
      cal.href = URL.createObjectURL(new Blob([lines.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar' }));
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
    if (page === 'checkout') initCheckout();
    if (page === 'confirmed') initConfirmed();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
