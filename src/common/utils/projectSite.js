const AppError = require('../../common/errors/AppError');
const requireDoc = require('../../common/utils/requireDoc');
const Project = require('../../modules/projects/project.model');
const Site = require('../../modules/sites/site.model');

async function resolveProjectSite(projectId, siteId) {
  const [site, givenProject] = await Promise.all([
    siteId ? requireDoc(Site, siteId, 'Site') : null,
    projectId ? requireDoc(Project, projectId, 'Project') : null,
  ]);

  let project = givenProject;
  if (!project && site && site.project) {
    project = await requireDoc(Project, site.project, 'Project');
  }

  if (site && project && String(site.project) !== String(project._id)) {
    throw new AppError('Site does not belong to the selected project', 400, 'BAD_REQUEST');
  }

  return {
    site,
    project,
    projectId: project ? project._id : undefined,
  };
}

module.exports = { resolveProjectSite };
