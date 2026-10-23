'use strict';
(() => {
  if (!window.HangoutDiary) return;
  let status = '기기에 암호화해 저장해요.', state = 'idle';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function decorate() {
    const host=document.querySelector('#app main'); if(!host)return;
    if(!document.querySelector('.hangout-return')) {
      const row=document.createElement('div');row.className='hangout-return';
      row.innerHTML='<button data-hangout="exit" aria-label="아지트로 돌아가기">‹ 아지트</button><span class="hangout-state" role="status"></span>';
      host.prepend(row);
    }
    const label=document.querySelector('.hangout-state');if(label){const text=state==='syncing'?'서버에 보관 중':state==='saved'?'서버 보관됨':state==='error'||state==='conflict'?'백업 확인 필요':'나의 일기';if(label.textContent!==text)label.textContent=text;label.title=status;}
    const settings=document.querySelector('.settings-section');
    if(settings && !document.querySelector('.hangout-backup')) {
      const section=document.createElement('section');section.className='settings-section hangout-backup';
      section.innerHTML='<h2 class="settings-label">아지트 서버 백업</h2><p class="hangout-backup-message" role="status"></p><div class="settings-card"><button class="setting-row" data-hangout="syncNow"><div><span class="setting-row-title">지금 서버에 보관</span><small>기록·휴지통·첨부를 함께 백업해요</small></div>↗</button><button class="setting-row" data-hangout="restore"><div><span class="setting-row-title">서버 백업 가져오기</span><small>마스터가 복구한 기록도 여기서 가져와요</small></div>↙</button><button class="setting-row hangout-force" data-hangout="uploadLocal"><div><span class="setting-row-title">이 기기의 기록으로 새 버전 만들기</span><small>충돌을 확인한 뒤 직접 선택해 주세요</small></div>›</button></div><p class="page-description">마스터 관리자는 서버의 일기를 조회·백업·복구할 수 있어요. 지키미는 직접 첨부한 글만 읽어요.</p>';
      settings.before(section);
    }
    const message=document.querySelector('.hangout-backup-message');if(message&&message.textContent!==status)message.textContent=status;
    const force=document.querySelector('.hangout-force');if(force)force.hidden=state!=='conflict'&&state!=='error';
    const detail=document.querySelector('.detail-meta');
    if(detail && !document.querySelector('[data-hangout="share"]')) {
      const button=document.createElement('button');button.className='text-button';button.dataset.hangout='share';button.textContent='지키미와 이 이야기 나누기';detail.before(button);
    }
  }
  window.onHangoutSync = value => { status=value.message;state=value.state;decorate(); };
  document.addEventListener('click',event => {
    const button=event.target.closest('[data-hangout]');if(!button)return;
    const action=button.dataset.hangout;
    if(action==='share') {
      const app=window.DiaryApp, entry=app?.data.entries.find(e=>e.id===app.detailId);
      if(!entry||!document.querySelector('.detail-body'))return;
      window.HangoutDiary.share('이 일기를 함께 돌아봐 줘. 내가 적은 내용만 바탕으로 이야기해 줘.\n\n'+entry.date+' · '+entry.title+'\n'+entry.body.slice(0,10000));
    } else if(['exit','syncNow','restore','uploadLocal'].includes(action)) window.HangoutDiary[action]();
  });
  const observer=new MutationObserver(decorate);observer.observe(document.getElementById('app'),{childList:true,subtree:true});decorate();
})();
