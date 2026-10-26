const AppError = require('../../common/errors/AppError');
const requireDoc = require('../../common/utils/requireDoc');
const Project = require('../../modules/projects/project.model');
const Site = require('../../modules/sites/site.model');

async function resolveProjectSite(projectId, siteId) {
  let site = null;
  if (siteId) {
    site = await requireDoc(Site, siteId, 'Site', { isDeleted: false });
  }

  const resolvedProjectId = projectId || (site ? site.project : undefined);
  if (resolvedProjectId) {
    await requireDoc(Project, resolvedProjectId, 'Project', { isDeleted: false });
  }

  if (site && resolvedProjectId && String(site.project) !== String(resolvedProjectId)) {
    throw new AppError('Site does not belong to the selected project', 400, 'BAD_REQUEST');
  }

  return {
    site,
    projectId: resolvedProjectId,
  };
}

module.exports = { resolveProjectSite };
