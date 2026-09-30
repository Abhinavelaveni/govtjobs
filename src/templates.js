const DEFAULT = `🔔 GOVERNMENT JOB ALERT\n\n📌 Job: {JOB_TITLE}\n\n🏢 Organization:\n{ORGANIZATION}\n\n💼 Vacancies:\n{VACANCIES}\n\n🎓 Qualification:\n{QUALIFICATION}\n\n📍 Location:\n{LOCATION}\n\n💰 Salary:\n{SALARY}\n\n📅 Last Date:\n{LAST_DATE}\n\n📝 Apply Online:\n{APPLICATION_URL}\n\n📄 Official Notification:\n{NOTIFICATION_URL}\n\nSource:\n{SOURCE_NAME}\n\nReply STOP to opt out.`;
export function render(job, source, body = DEFAULT) {
  const v = { JOB_TITLE: job.title, ORGANIZATION: job.organization, VACANCIES: job.vacancies ?? 'Not specified',
    QUALIFICATION: (job.qualification || []).join(', ') || 'See notification', LOCATION: job.location || 'See notification',
    SALARY: job.salary || 'See notification', LAST_DATE: job.last_date || 'See notification',
    APPLICATION_URL: job.application_url || job.notification_url, NOTIFICATION_URL: job.notification_url, SOURCE_NAME: source };
  return Object.entries(v).reduce((t, [k, x]) => t.split(`{${k}}`).join(String(x)), body);
}
