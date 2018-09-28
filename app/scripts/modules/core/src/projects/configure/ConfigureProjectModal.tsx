import * as React from 'react';

import { IApplicationSummary, ApplicationReader } from 'core/application';
import { IProject, IProjectCluster, IProjectPipeline } from 'core/domain';
import { WizardModal } from 'core/modal';
import { PipelineConfigService } from 'core/pipeline';
import { IModalComponentProps, ReactModal } from 'core/presentation';
import { Applications, Clusters, Pipelines, ProjectAttributes } from 'core/projects';
import { TaskMonitor } from 'core/task';
import { noop } from 'core/utils';

import { ProjectReader } from '../service/ProjectReader';
import { ProjectWriter } from '../service/ProjectWriter';

import './ConfigureProjectModal.css';

export interface IConfigureProjectModalProps extends IModalComponentProps {
  title: string;
  projectConfiguration: IProject;
  command: {
    viewState: {
      applications: string[];
      pipelineConfigs: IProjectPipeline[];
      clusters: IProjectCluster[];
      attributes: { name: string; email: string };
    };
  };
}

export interface IConfigureProjectModalState {
  loaded: boolean;
  existingProjectNames: string[];
  appPipelines: Map<string, Array<{ name: string; id: string }>>;
  allApplications: IApplicationSummary[];
  taskMonitor: TaskMonitor;
}

export interface IUpsertProjectCommand {
  config: {
    applications: IProject['config']['applications'];
    clusters: IProject['config']['clusters'];
    pipelineConfigs: IProjectPipeline[];
  };
  email: string;
  id: string;
  name: string;
}

export class ConfigureProjectModal extends React.Component<IConfigureProjectModalProps, IConfigureProjectModalState> {
  public static defaultProps: Partial<IConfigureProjectModalProps> = {
    closeModal: noop,
    dismissModal: noop,
  };

  public static show(props: IConfigureProjectModalProps): Promise<any> {
    const modalProps = { dialogClassName: 'wizard-modal modal-lg' };
    return ReactModal.show(ConfigureProjectModal, props, modalProps);
  }

  constructor(props: IConfigureProjectModalProps) {
    super(props);

    this.state = {
      loaded: false,
      existingProjectNames: [],
      appPipelines: new Map(),
      allApplications: [],
      taskMonitor: new TaskMonitor({
        title: 'Updating Project',
        onTaskComplete: this.onTaskComplete,
        modalInstance: TaskMonitor.modalInstanceEmulation(() => this.props.dismissModal()),
      }),
    };
  }

  public componentDidMount() {
    const { projectConfiguration } = this.props;
    const applications = projectConfiguration && projectConfiguration.config.applications;
    if (applications.length) {
      this.fetchPipelinesForApps(applications);
    }
    this.fetchProjects();
    this.fetchApplicationsList();
  }

  private onTaskComplete = () => {};

  private submit = (values: IUpsertProjectCommand) => {
    const { projectConfiguration } = this.props;
    const { applications, pipelineConfigs, clusters, name, email } = values;

    const id = projectConfiguration.id || null;
    const config = { applications, pipelineConfigs, clusters };
    const project = { name, id, email, config, notFound: false };

    this.state.taskMonitor.submit(() => ProjectWriter.upsertProject(project));
  };

  public validate = (): { [key: string]: string } => {
    return {};
  };

  private fetchProjects = () => {
    ProjectReader.listProjects().then(projects => {
      const existingProjectNames = projects.map(project => project.name);
      this.setState({ existingProjectNames, loaded: true });
    });
  };

  private fetchApplicationsList = () =>
    ApplicationReader.listApplications().then(allApplications => this.setState({ allApplications }));

  private fetchPipelinesForApps = (applications: string[]) => {
    // Only fetch for the apps we don't already have results for
    applications.filter(app => !this.state.appPipelines.get(app)).forEach(async app => {
      const configs = await PipelineConfigService.getPipelinesForApplication(app);
      const pipelineConfigs = configs.map(config => ({ name: config.name, id: config.id }));
      const appPipelines = { ...this.state.appPipelines, [app]: pipelineConfigs };
      this.setState({ appPipelines });
    });
  };

  private onDelete = () => {
    const { projectConfiguration } = this.props;
    if (projectConfiguration) {
      this.state.taskMonitor.submit(() => ProjectWriter.deleteProject(projectConfiguration));
    }
  };

  public render() {
    const { dismissModal, projectConfiguration } = this.props;
    const { allApplications, appPipelines, loaded, taskMonitor } = this.state;
    const pc = projectConfiguration || ({ config: {} } as IProject);

    const { name, email } = pc;
    const { applications, pipelineConfigs, clusters } = pc.config;

    const initialValues = { name, email, applications, pipelineConfigs, clusters };

    return (
      <WizardModal
        heading="Configure Project"
        initialValues={initialValues}
        loading={!loaded}
        taskMonitor={taskMonitor}
        dismissModal={dismissModal}
        closeModal={this.submit}
        submitButtonLabel="Save"
        validate={this.validate}
      >
        <ProjectAttributes
          onDelete={this.onDelete}
          existingProjectNames={this.state.existingProjectNames}
          isNewProject={!projectConfiguration.id}
          done={!!(projectConfiguration.name && projectConfiguration.email)}
        />

        <Applications
          applications={projectConfiguration ? projectConfiguration.config.applications : []}
          allApplications={allApplications.map(app => app.name)}
          onChange={this.fetchPipelinesForApps}
          done={!!(projectConfiguration && projectConfiguration.config.applications.length)}
        />

        <Clusters
          entries={projectConfiguration ? projectConfiguration.config.clusters : []}
          applications={Array.from(appPipelines.keys())}
          done={!!(projectConfiguration && projectConfiguration.config.clusters.length)}
        />

        <Pipelines
          appsPipelinesMap={appPipelines}
          entries={projectConfiguration ? projectConfiguration.config.pipelineConfigs : []}
          done={!!(projectConfiguration && projectConfiguration.config.pipelineConfigs.length)}
        />
      </WizardModal>
    );
  }
}
