(function ($) {
  "use strict";

  var CONTRACT = "0x6b785a0322126826d8226d77e173d75DAfb84d11";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fallbackCopy(text, done) {
    var $input = $("<textarea readonly></textarea>");
    $input.val(text).css({ position: "fixed", top: "-999px", left: "-999px" }).appendTo("body");
    $input[0].select();
    document.execCommand("copy");
    $input.remove();
    done();
  }

  function copyToClipboard(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }

  function showCopyToast(text) {
    var $toast = $(".copy-toast");

    if (!$toast.length) {
      return;
    }

    window.clearTimeout($toast.data("timer"));
    $toast.text(text).addClass("is-visible");
    $toast.data("timer", window.setTimeout(function () {
      $toast.removeClass("is-visible");
    }, 2400));
  }

  function initCopy() {
    $("[data-copy-contract]").on("click", function () {
      var $button = $(this);
      var $label = $button.find(".copy-label");
      var original = $button.attr("data-copy-label") || $label.text() || "Copy";

      copyToClipboard(CONTRACT, function () {
        $label.text("Copied");
        $(".copy-status").text("Contract copied.");
        showCopyToast(CONTRACT);
        window.setTimeout(function () {
          $label.text(original);
          $(".copy-status").text("");
        }, 1600);
      });
    });
  }

  function initNav() {
    var $header = $(".site-header");
    var $toggle = $(".nav-toggle");
    var $toTop = $(".to-top");

    function syncChrome() {
      var isScrolled = window.scrollY > 16;
      $header.toggleClass("is-scrolled", isScrolled);
      $toTop.toggleClass("is-visible", window.scrollY > 460);
    }

    $toggle.on("click", function () {
      var isOpen = !$header.hasClass("is-open");
      $header.toggleClass("is-open", isOpen);
      $("body").toggleClass("menu-open", isOpen);
      $toggle.attr("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });

    $(".scroll-link, .brand").on("click", function () {
      $header.removeClass("is-open");
      $("body").removeClass("menu-open");
      $toggle.attr("aria-label", "Open navigation");
    });

    $toTop.on("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    $(window).on("scroll", syncChrome);
    syncChrome();
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");

    if (!items.length) {
      return;
    }

    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach(function (item) {
        item.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });

    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  $(function () {
    initCopy();
    initNav();
    initReveal();
  });
})(jQuery);
