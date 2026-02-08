// チュートリアルページ用のJavaScript

$(document).ready(function () {
  // スムーススクロール
  $(".nav-link").on("click", function (e) {
    e.preventDefault();
    const targetId = $(this).attr("href");
    const targetSection = $(targetId);

    if (targetSection.length) {
      // アクティブ状態を更新
      $(".nav-link").removeClass("active");
      $(this).addClass("active");

      // スムーススクロール
      $("html, body").animate(
        {
          scrollTop: targetSection.offset().top - 80,
        },
        500
      );
    }
  });

  // スクロール位置に応じてアクティブなナビゲーションリンクを更新
  function updateActiveNav() {
    const scrollPos = $(window).scrollTop() + 100;

    $(".tutorial-section").each(function () {
      const section = $(this);
      const sectionTop = section.offset().top;
      const sectionBottom = sectionTop + section.outerHeight();
      const sectionId = "#" + section.attr("id");

      if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
        $(".nav-link").removeClass("active");
        $('.nav-link[href="' + sectionId + '"]').addClass("active");
      }
    });
  }

  // スクロールイベント
  $(window).on("scroll", updateActiveNav);

  // ページ読み込み時にアクティブなセクションを設定
  updateActiveNav();

  // FAQ項目のアコーディオン機能（オプション）
  $(".faq-question").on("click", function () {
    const answer = $(this).next(".faq-answer");
    const item = $(this).closest(".faq-item");

    // 他のFAQを閉じる
    $(".faq-item").not(item).find(".faq-answer").slideUp(200);
    $(".faq-item").not(item).removeClass("expanded");

    // クリックしたFAQを開閉
    answer.slideToggle(200);
    item.toggleClass("expanded");
  });

  // ハンバーガーメニューの処理（既存のmain.jsと統合）
  $(".hamburger").on("click", function () {
    $(this).toggleClass("active");
    $(".nav-actions").toggleClass("active");
  });

  // ナビゲーション外をクリックしたらメニューを閉じる
  $(document).on("click", function (e) {
    if (!$(e.target).closest(".nav, .hamburger").length) {
      $(".hamburger").removeClass("active");
      $(".nav-actions").removeClass("active");
    }
  });
});
