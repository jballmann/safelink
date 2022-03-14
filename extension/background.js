function getHostName(url) {
  url = url.replace(/http(s)?:\/\/(www[0-9]?.)?/, '');
  return (new URL('http://' + url)).hostname;
}

const SOURCE = {
  publicSuffixList: 'https://publicsuffix.org/list/public_suffix_list.dat',
  trusted: 'https://raw.githubusercontent.com/jballmann/safelink/master/lists/hosts_trusted.txt',
  redirect: 'https://raw.githubusercontent.com/jballmann/safelink/master/lists/hosts_redirect.txt',
  orgs: 'https://raw.githubusercontent.com/jballmann/safelink/master/lists/orgs.txt',
  suspicious: [
    {
      url: 'https://curben.gitlab.io/malware-filter/phishing-filter-hosts.txt',
      get: (line) => line.split(' ')[1]
    },
    {
      url: 'https://phishstats.info/phish_score.csv',
      get: (line) => line.split(',')[2].replace(/"/g, '')
    }
  ]
}

function filterComments(array) {
  return array.filter(function (line){
    return line !=='' &&
    !line.startsWith('!') &&
    !line.startsWith('#')
  });
}

function filterEmptyStrings(array) {
  return array.filter(function (line){
    return line !== '';
  });
}

/**
  * Fetches the Public Suffix List and persists them
  */
async function updatePSL() {    
  try {
    const response = await window.fetch(SOURCE.publicSuffixList);
    await messenger.storage.local.set({
      'psl': await response.text(),
      'pslVersion': Date.now()
    });
  }
  catch (error) { console.log(error); }
}

async function fetchAndParse(listName, processFunction) {
  let lines;
  try {
    const response = await window.fetch(SOURCE[listName]);
    lines = (await response.text()).split('\n');
    
    const lastUpdateAt = lines.shift().replace(/^[|]$/g, '');
    
    const version = (await messenger.storage.local.get(listName + 'Version'))[listName + 'Version'];
    if(version && new Date(version) >= new Date(lastUpdateAt)) {
      return;
    }
  }
  catch (error) { console.log(error); return; }
  
  lines = filterComments(lines);
  
  if (!processFunction) {
    return lines;
  }
    
  return processFunction(lines);
}

/**
  * Fetches, parses and persists the trusted hosts
  */
async function updateTrustedHosts() {
  const parsed = await fetchAndParse('trusted', function (lines) {
    const obj = {};
    lines.forEach((line) => {
      const [host, id] = line.split(';');
      obj[host] = id;
    });
    return obj;
  });
  
  if (!parsed) { return; }
    
  await messenger.storage.local.set({
    'trusted': parsed,
    'trustedVersion': Date.now()
  });
}

/**
  * Fetches, parses and persists the redirect hosts
  */
async function updateRedirectHosts() {
  const parsed = await fetchAndParse('redirect');
  
  if (!parsed) { return; }
    
  await messenger.storage.local.set({
    'redirect': parsed,
    'redirectVersion': Date.now()
  });
}

/**
  * Fetches, parses and persists the organization list
  */
async function updateOrganizationList() {
  const parsed = await fetchAndParse('orgs', function (lines) {
    console.log(lines);
    const obj = {};
    lines.forEach((line) => {
      const [id, name, sector, country] = line.split(';');
      obj[id] = {
        name,
        sector,
        country
      };
    });
    return obj;
  });
  
  if (!parsed) { return; }
  
  console.log(parsed);
    
  await messenger.storage.local.set({
    'orgs': JSON.stringify(parsed),
    'orgsVersion': Date.now()
  });
}

async function updateSuspiciousHosts() {
  const lists = await Promise.all(SOURCE.suspicious.map(async function ({ url, get }){
    let lines;
    try {
      const response = await window.fetch(url);
      lines = (await response.text()).split('\n');
    }
    catch (error) { console.log(error); return; }
    
    lines = filterComments(lines);
    
    if (!get) {
      return lines;
    }
    return lines.map(function (line) {
      const record = get(line);
      return getHostName(record);
    });
  }));
  
  let fullList = [].concat(...lists);
  
  // remove duplicates
  fullList = [...new Set(fullList)];
  
  await messenger.storage.local.set({
    'suspicious': fullList
  });
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
}

async function findDomain(urlString) {
  const host = getHostName(urlString);
  const domain = PublicSuffixList.getDomain(host);
  
  const splitByDot = domain.split('.');
  const sld = splitByDot.shift();
  const tld = splitByDot.join('.');
  const domainInfo = {
    domain,
    secondLevelDomain: sld,
    topLevelDomain: tld,
  }
  
  // look up domain in trusted hosts
  const { trusted } = await messenger.storage.local.get('trusted');
  
  if (trusted[domain]) {
    console.log('trusted');
    
    const orgs = JSON.parse((await messenger.storage.local.get('orgs')).orgs);
    const orgDetails = orgs[trusted[domain]] || {};
    const result = {
      type: 'trusted',
      ...domainInfo,
      ...orgDetails
    };
    console.log(result);
    return result;
  }
  
  // look up domain in redirect hosts
  const { redirect } = await messenger.storage.local.get('redirect');
  
  if (redirect.indexOf(domain) > -1) {
    console.log('redirect');
    return {
      type: 'redirect',
      ...domainInfo
    }
  }
  
  // look up domain and host in suspicious hosts
  const { suspicious } = await messenger.storage.local.get('suspicious');
  
  if (suspicious.indexOf(domain) > -1 || suspicious.indexOf(host) > -1) {
    console.log('suspicious');
    return {
      type: 'suspicious',
      ...domainInfo
    }
  }
  
  console.log('unknown');
  return {
    ...domainInfo
  }
}

async function run() {
  // if psl is older than 1 day update it
  const { pslVersion } = await messenger.storage.local.get('pslVersion');
  if (!pslVersion || new Date() > new Date(pslVersion + 86400000)) {
    await updatePSL();
  }
  const psl = await messenger.storage.local.get('psl');
  PublicSuffixList.parse(psl, punycode.toASCII);
  
  await updateOrganizationList();
  await updateTrustedHosts();
  await updateRedirectHosts();
  await updateSuspiciousHosts();
  
  console.log('saved:', await messenger.storage.local.get('suspicious'));
  
  await registerContentScripts();
  await registerRuntimeMessageHandler();
}

document.addEventListener("DOMContentLoaded", run);