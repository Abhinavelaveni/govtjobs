// Official sources with tested Node adapters are ready to inspect; unknown page layouts stay disabled.
const P = (name, url, gov_level, category, adapter = 'generic', config = {}, enabled = false) => ({
  name, url, adapter, enabled, config: {
    organization: name, category, gov_level, pages: [url], sourceTier: config.sourceTier || 'tier1',
    sourceAuthority: config.sourceAuthority || 'official', ...config
  }
});
export const PRESETS = [
  P('UPSC', 'https://www.upsc.gov.in/rss.php', 'Central', 'Central Government', 'upsc-rss', { sourcePage: 'https://upsc.gov.in/recruitment/recruitment-advertisement' }),
  P('SSC', 'https://ssc.gov.in/', 'Central', 'Central Government', 'ssc-notices', { pageLimit: 3, sourcePage: 'https://ssc.gov.in/' }),
  P('IBPS', 'https://www.ibps.in/index.php/crp-updates', 'Central', 'Banking', 'ibps-updates'),
  P('SBI Careers', 'https://sbi.bank.in/web/careers/current-openings', 'Central', 'Banking', 'sbi-careers', {}, true),
  P('Railway Recruitment Boards', 'https://rrb.indianrailways.gov.in/chandigarh', 'Central', 'Railways', 'rrb-notices', {
    organization: 'Railway Recruitment Board, Chandigarh', sourcePage: 'https://rrb.indianrailways.gov.in/chandigarh', cenLimit: 8,
    applicationUrl: 'https://www.rrbapply.gov.in/#/auth/landing'
  }),
  P('Employment News', 'https://employmentnews.gov.in/NewEmp/AllJobs.aspx?k=All', 'Central', 'Other', 'employment-news'),
  P('FreeJobAlert Telangana', 'https://www.freejobalert.com/telangana-government-jobs/', null, 'Other', 'freejobalert-telangana', { sourceTier: 'tier2', sourceAuthority: 'aggregator', articleLimit: 15 }),
  P('Sahi Sarkari Jobs', 'https://www.sahisarkarijobs.in/', null, 'Other', 'sahi-sarkari-jobs', { sourceTier: 'tier2', sourceAuthority: 'aggregator', articleLimit: 15 }),
  P('GovtJobGuru', 'https://govtjobguru.in/government-jobs-openings/', null, 'Other', 'govtjobguru', { sourceTier: 'tier2', sourceAuthority: 'aggregator', jobLimit: 50 }, true),
  P('NTPC Careers', 'https://careers.ntpc.co.in/recruitment/', 'Central', 'PSU', 'ntpc-careers', { sourcePage: 'https://careers.ntpc.co.in/recruitment/', issuerHosts: ['careers.ntpc.co.in'] }),
];
