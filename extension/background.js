async function updateKnowledge() {
  const knowledge = messenger.storage.local;
  
  await knowledge.set({'i am never empty': true });
  await knowledge.clear();
  
  await knowledge.set({
    'updatedAt': new Date(),
    't1p.de': { type: 'redirect' },
    'postbank.de': { type: 'trusted', org: 'Postbank' },
    'malcode.net': { type: 'untrusted' },
    'rwth-aachen.de': { type: 'trusted', org: 'RWTH Aachen University' },
    'orgs': {
      'Postbank': {
        sector: 'fin',
        country: 'DE'
      },
      'RWTH Aachen University': {
        sector: 'edu',
        country: 'DE'
      }
    }
  });
  console.log('knowledge updated');
}

async function updatePublicSuffixList() {
  const response = await window.fetch('https://publicsuffix.org/list/public_suffix_list.dat');
  messenger.storage.local.set({
    'publicSuffixList': await response.text()
  })
  console.log('public suffixes updated')
}

async function registerContentScripts() {
  await messenger.messageDisplayScripts.register({
    js: [
      { file: 'js/common.js' },
    ],
    css: [
      { file: 'style/common.css' },
      { file: 'style/iconmonstr-font.css' }
    ]
  });
  console.log('content scripts registered');
}

async function registerRuntimeMessageHandler() {
  messenger.runtime.onMessage.addListener(async (message) => { 
    console.log('retrieved msg:', message);
    if (message && message.hasOwnProperty("command")) {
      // Check for known commands.
      switch (message.command) {
        case "log": console.log(message.payload); break;
        case "findDomain": return await findDomain(message.payload);
      }
    }
  });
  console.log('listen to runtime messages');
}

async function findDomain(urlString) {
  let url = new URL(urlString);
  
  let domain = PublicSuffixList.getDomain(url.hostname);
  
  const splitByDot = domain.split('.');
  const sld = splitByDot.shift();
  const tld = splitByDot.join('.');
  
  const domainInfo = (await messenger.storage.local.get(domain))[domain] || {};
  console.log(domainInfo);
  
  let orgInfo;
  if (domainInfo.type === 'trusted' && domainInfo.org) {
    orgInfo = (await messenger.storage.local.get('orgs'))['orgs'][domainInfo.org];
  }
  
  return {
    domain,
    secondLevelDomain: sld,
    topLevelDomain: tld,
    ...domainInfo,
    ...orgInfo
  }
}

async function run() { 
  await updateKnowledge();
  
  await updatePublicSuffixList();
  const list = await messenger.storage.local.get('publicSuffixList');
  PublicSuffixList.parse(list, punycode.toASCII);
  
  await registerContentScripts();
  await registerRuntimeMessageHandler();
}

document.addEventListener("DOMContentLoaded", run);