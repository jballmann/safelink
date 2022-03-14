async function openLinkInfo(url) {
  
  const domainDetails = await messenger.runtime.sendMessage({
    command: 'findDomain',
    payload: url
  });
  
  const background = document.createElement('div');
  background.classList.add('safelink', 'fixed', 'full-window', 'backdrop', 'overflow-auto');
  
  const wrapper = document.createElement('div');
  wrapper.classList.add('flex', 'flex-centered', 'p-5', 'min-full-height');
  
  const container = document.createElement('div');
  container.classList.add('px-5', 'py-3', 'bg-white', 'max-width-550px', 'border-radius');
  
  let type;
  let iconClass;
  switch(domainDetails.type) {
    case 'trusted':
      type = 'trusted';
      iconClass = 'im-check-mark-circle';
      break;
    case 'suspicious':
      type = 'suspicious';
      iconClass = 'im-warning-circle';
      break;
    case 'redirect':
      type = 'redirect';
      iconClass = 'im-flash';
      break;
    default:
      type = 'unknown';
      iconClass = 'im-question';
  }
  
  if (type === 'redirect') {
    if (!url.endsWith('+')) {
      url += '+'
    }
  }
  
  const i18n = messenger.i18n;
  const lang = i18n.getMessage('@@ui_locale');
  
  container.innerHTML = `
    <div class="table table-fixed">
      <div class="table-row color-grey">
        <div class="table-column py-1 pr-3 width-80px">URL</div>
        <div class="table-column py-1 truncate">${ url }</div>
      </div>
      <div class="table-row">
        <div class="table-column py-1 pr-3 width-80px">Domain</div>
        <div class="table-column py-1">
          <div class="flex space-between">
            <div class="flex-auto">
              <div class="color-${ type }">
                <b>${ domainDetails.secondLevelDomain }</b>.${ domainDetails.topLevelDomain }
              </div>
              <div style="font-size: 12px; color: grey;">
                ${ i18n.getMessage('type_' + type) }
              </div>
            </div>
            <div class="flex-none">
              <i class="im ${ iconClass } color-${ type }"></i>
            </div>
          </div>
        </div>
      </div>
      ${(() => {
        if (domainDetails.name) {
          return `
            <div class="table-row">
              <div class="table-column py-1 pr-3 width-80px">${ i18n.getMessage('by') }</div>
              <div class="table-column py-1">
                <div>${ domainDetails.name }</div>
                <div class="small-text color-grey">
                  ${ i18n.getMessage('sector_' + domainDetails.sector) }, ${ domainDetails.country }
                </div>
              </div>
            </div>
          `
        }
        if (type === 'unknown') {
          return `
            <div class="table-row">
              <div class="table-column py-1 pr-3 width-80px"></div>
              <div class="table-column py-1">
                <a
                  class="color-primary"
                  href="https://github.com/jballmann/safelink/blob/master/docs/${lang}/domaincheck.md"
                >
                  ${ i18n.getMessage('checkDomain') } <i class="small-text im im-angle-right"></i>
                </a>
              </div>
            </div>
          `
        }
        return '';
      })()}
    </div>
    
    <div class="mt-3 pb-1">
      <a
        class="block bg-${ type } color-white p-2 centered border-radius unstyled"
        href="${ url }"
      >
        ${ i18n.getMessage('openURL') }
        ${
          type === 'suspicious' ?
            '<i class="small-text space-left im im-warning"></i>':
            '<i class="small-text space-left im im-external-link"></i>'
        }
      </a>
    </div>
  `;

  const wrapperClickHandler = (event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    wrapper.removeEventListener('click', wrapperClickHandler);
    document.body.removeChild(background);
  }
  wrapper.addEventListener('click', wrapperClickHandler);
  
  wrapper.appendChild(container);
  background.appendChild(wrapper);
  document.body.appendChild(background);
}

function handleLinkClicks() {  
  document.querySelectorAll('a').forEach((link) => {
    if (link.href.startsWith('mailto:')) {
      return
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openLinkInfo(link.href);
    });
  });
}
handleLinkClicks();