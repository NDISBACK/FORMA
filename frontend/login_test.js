(function () {
      const cards = Array.from(document.querySelectorAll('.report-card'));
      const TOTAL = cards.length;
      const INTERVAL = 4000;  // ms between cycles
      let isAnimating = false;

      // Animate metric bars for the front card
      function animateBars(card) {
        const fills = card.querySelectorAll('.metric__fill');
        fills.forEach((fill, i) => {
          fill.style.width = '0%';
          setTimeout(() => {
            fill.style.width = fill.dataset.width + '%';
          }, 100 + i * 120);
        });

        // Animate SVG arc
        const arc = card.querySelector('.score-arc__fill');
        if (arc) {
          arc.style.strokeDashoffset = '207';
          setTimeout(() => {
            arc.style.strokeDashoffset = arc.dataset.target;
          }, 150);
        }
      }

      // Reset bars for non-front cards
      function resetBars(card) {
        const fills = card.querySelectorAll('.metric__fill');
        fills.forEach(fill => { fill.style.width = '0%'; });
        const arc = card.querySelector('.score-arc__fill');
        if (arc) arc.style.strokeDashoffset = '207';
      }

      function cycle() {
        if (isAnimating) return;
        isAnimating = true;

        const front = cards.find(c => c.dataset.pos === '0');

        // Drop z-index of front card so it visually goes behind others
        front.style.zIndex = '0';

        // Shift all positions: front → back, others move forward
        cards.forEach(card => {
          let pos = parseInt(card.dataset.pos);
          card.dataset.pos = (pos - 1 + TOTAL) % TOTAL;
        });

        // After the CSS transition completes
        setTimeout(() => {
          // Clear inline z-index so CSS rules take over
          front.style.zIndex = '';

          // Animate bars on new front card
          const newFront = cards.find(c => c.dataset.pos === '0');
          animateBars(newFront);

          // Reset bars on non-front cards
          cards.forEach(c => {
            if (c.dataset.pos !== '0') resetBars(c);
          });

          isAnimating = false;
        }, 850);
      }

      // Initial bar animation for card 0
      setTimeout(() => {
        animateBars(cards.find(c => c.dataset.pos === '0'));
      }, 700);

      // Start cycling
      setInterval(cycle, INTERVAL);
    })();