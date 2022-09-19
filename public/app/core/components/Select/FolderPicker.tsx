import { css } from '@emotion/css';
import { t } from '@lingui/macro';
import { debounce } from 'lodash';
import React, { useState, useEffect, useMemo, useCallback, FormEvent } from 'react';
import { useAsync } from 'react-use';

import { AppEvents, SelectableValue, GrafanaTheme2 } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { useStyles2, ActionMeta, AsyncSelect, Input, InputActionMeta, Icon, Stack, Tooltip } from '@grafana/ui';
import appEvents from 'app/core/app_events';
import { contextSrv } from 'app/core/services/context_srv';
import { createFolder, getFolderById, searchFolders } from 'app/features/manage-dashboards/state/actions';
import { DashboardSearchHit } from 'app/features/search/types';
import { AccessControlAction, PermissionLevelString } from 'app/types';

const SlashesWarning = () => {
  const styles = useStyles2(getStyles);
  const onClick = () => window.open('https://github.com/grafana/grafana/issues/42947', '_blank');
  return (
    <Stack gap={0.5}>
      <div className={styles.slashNotAllowed}>Folders with &apos;/&apos; character are not allowed.</div>
      <Tooltip placement="top" content={'Link to the Github issue'} theme="info">
        <Icon name="info-circle" size="xs" className={styles.infoIcon} onClick={onClick} />
      </Tooltip>
    </Stack>
  );
};

export type FolderPickerFilter = (hits: DashboardSearchHit[]) => DashboardSearchHit[];

export const ADD_NEW_FOLER_OPTION = '+ Add new';

export interface Props {
  onChange: ($folder: { title: string; id: number }) => void;
  enableCreateNew?: boolean;
  rootName?: string;
  enableReset?: boolean;
  dashboardId?: number | string;
  initialTitle?: string;
  initialFolderId?: number;
  permissionLevel?: Exclude<PermissionLevelString, PermissionLevelString.Admin>;
  filter?: FolderPickerFilter;
  allowEmpty?: boolean;
  showRoot?: boolean;
  onClear?: () => void;
  accessControlMetadata?: boolean;
  customAdd?: boolean;
  dissalowSlashes?: boolean;
  /**
   * Skips loading all folders in order to find the folder matching
   * the folder where the dashboard is stored.
   * Instead initialFolderId and initialTitle will be used to display the correct folder.
   * initialFolderId needs to have an value > -1 or an error will be thrown.
   */
  skipInitialLoad?: boolean;
  /** The id of the search input. Use this to set a matching label with htmlFor */
  inputId?: string;
}
export type SelectedFolder = SelectableValue<number>;
const VALUE_FOR_ADD = -10;
const containsSlashes = (str: string): boolean => str.indexOf('/') !== -1;

export function FolderPicker(props: Props) {
  const {
    dashboardId,
    allowEmpty,
    onChange,
    filter,
    enableCreateNew,
    inputId,
    onClear,
    enableReset,
    initialFolderId,
    initialTitle,
    permissionLevel,
    rootName,
    showRoot,
    skipInitialLoad,
    accessControlMetadata,
    customAdd,
    dissalowSlashes,
  } = props;

  const [folder, setFolder] = useState<SelectedFolder | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [newFolderValue, setNewFolderValue] = useState(folder?.title || '');

  const styles = useStyles2(getStyles);

  const isClearable = typeof onClear === 'function';
  const isUsingSlashes = containsSlashes(inputValue);

  const getOptions = useCallback(
    async (query: string) => {
      const searchHits = await searchFolders(query, permissionLevel, accessControlMetadata);
      const options: Array<SelectableValue<number>> = mapSearchHitsToOptions(
        searchHits,
        Boolean(dissalowSlashes),
        filter
      );

      const hasAccess =
        contextSrv.hasAccess(AccessControlAction.DashboardsWrite, contextSrv.isEditor) ||
        contextSrv.hasAccess(AccessControlAction.DashboardsCreate, contextSrv.isEditor);

      if (hasAccess && rootName?.toLowerCase().startsWith(query.toLowerCase()) && showRoot) {
        options.unshift({ label: rootName, value: 0 });
      }

      if (
        enableReset &&
        query === '' &&
        initialTitle !== '' &&
        !options.find((option) => option.label === initialTitle)
      ) {
        Boolean(initialTitle) && options.unshift({ label: initialTitle, value: initialFolderId });
      }
      if (enableCreateNew && customAdd) {
        return [...options, { value: VALUE_FOR_ADD, label: ADD_NEW_FOLER_OPTION, title: query }];
      } else {
        return options;
      }
    },
    [
      enableReset,
      initialFolderId,
      initialTitle,
      permissionLevel,
      rootName,
      showRoot,
      accessControlMetadata,
      filter,
      enableCreateNew,
      customAdd,
      dissalowSlashes,
    ]
  );

  const debouncedSearch = useMemo(() => {
    return debounce(getOptions, 300, { leading: true });
  }, [getOptions]);

  const loadInitialValue = async () => {
    const resetFolder: SelectableValue<number> = { label: initialTitle, value: undefined };
    const rootFolder: SelectableValue<number> = { label: rootName, value: 0 };

    const options = await getOptions('');

    let folder: SelectableValue<number> | null = null;

    if (initialFolderId !== undefined && initialFolderId !== null && initialFolderId > -1) {
      folder = options.find((option) => option.value === initialFolderId) || null;
    } else if (enableReset && initialTitle) {
      folder = resetFolder;
    } else if (initialFolderId) {
      folder = options.find((option) => option.id === initialFolderId) || null;
    }

    if (!folder && !allowEmpty) {
      if (contextSrv.isEditor) {
        folder = rootFolder;
      } else {
        // We shouldn't assign a random folder without the user actively choosing it on a persisted dashboard
        const isPersistedDashBoard = !!dashboardId;
        if (isPersistedDashBoard) {
          folder = resetFolder;
        } else {
          folder = options.length > 0 ? options[0] : resetFolder;
        }
      }
    }
    !isCreatingNew && setFolder(folder);
  };

  useEffect(() => {
    // if this is not the same as our initial value notify parent
    if (folder && folder.value !== initialFolderId) {
      !isCreatingNew && onChange({ id: folder.value!, title: folder.label! });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, initialFolderId]);

  // initial values for dropdown
  useAsync(async () => {
    if (skipInitialLoad) {
      const folder = await getInitialValues({
        getFolder: getFolderById,
        folderId: initialFolderId,
        folderName: initialTitle,
      });
      setFolder(folder);
    }

    await loadInitialValue();
  }, [skipInitialLoad, initialFolderId, initialTitle]);

  useEffect(() => {
    if (folder && folder.id === VALUE_FOR_ADD) {
      setIsCreatingNew(true);
    }
  }, [folder]);

  const onFolderChange = useCallback(
    (newFolder: SelectableValue<number>, actionMeta: ActionMeta) => {
      const value = newFolder.value;
      if (value === VALUE_FOR_ADD) {
        setFolder({
          id: VALUE_FOR_ADD,
          title: inputValue,
        });
        setNewFolderValue(inputValue);
      } else {
        if (!newFolder) {
          newFolder = { value: 0, label: rootName };
        }

        if (actionMeta.action === 'clear' && onClear) {
          onClear();
          return;
        }

        setFolder(newFolder);
        onChange({ id: newFolder.value!, title: newFolder.label! });
      }
    },
    [onChange, onClear, rootName, inputValue]
  );

  const createNewFolder = useCallback(
    async (folderName: string) => {
      if (dissalowSlashes && containsSlashes(folderName)) {
        return false;
      }
      const newFolder = await createFolder({ title: folderName });
      let folder: SelectableValue<number> = { value: -1, label: 'Not created' };

      if (newFolder.id > -1) {
        appEvents.emit(AppEvents.alertSuccess, ['Folder Created', 'OK']);
        folder = { value: newFolder.id, label: newFolder.title };

        setFolder(newFolder);
        onFolderChange(folder, { action: 'create-option', option: folder });
      } else {
        appEvents.emit(AppEvents.alertError, ['Folder could not be created']);
      }

      return folder;
    },
    [onFolderChange, dissalowSlashes]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && containsSlashes(newFolderValue)) {
        event.preventDefault();
        return;
      }

      switch (event.key) {
        case 'Enter': {
          createNewFolder(folder?.title!);
          setIsCreatingNew(false);
          break;
        }
        case 'Escape': {
          setFolder({ value: 0, label: rootName });
          setIsCreatingNew(false);
        }
      }
    },
    [newFolderValue, createNewFolder, folder?.title, rootName]
  );

  const onNewFolderChange = (e: FormEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setNewFolderValue(value);
    setFolder({ id: -1, title: value });
  };

  const onBlur = () => {
    setFolder({ value: 0, label: rootName });
    setIsCreatingNew(false);
  };

  const onInputChange = (value: string, { action }: InputActionMeta) => {
    if (action === 'input-change') {
      setInputValue((ant) => value);
    }

    if (action === 'menu-close') {
      setInputValue((_) => value);
    }
    return;
  };
  const newValueContainsSlashes = containsSlashes(newFolderValue);

  if (isCreatingNew) {
    return (
      <>
        {dissalowSlashes && newValueContainsSlashes && <SlashesWarning />}
        <div className={styles.newFolder}>Press enter to create the new folder.</div>
        <Input
          aria-label={'aria-label'}
          width={30}
          autoFocus={true}
          value={newFolderValue}
          onChange={onNewFolderChange}
          onKeyDown={onKeyDown}
          placeholder="Press enter to confirm new folder."
          onBlur={onBlur}
        />
      </>
    );
  } else {
    return (
      <div data-testid={selectors.components.FolderPicker.containerV2}>
        {dissalowSlashes && isUsingSlashes && <SlashesWarning />}
        <AsyncSelect
          inputId={inputId}
          aria-label={selectors.components.FolderPicker.input}
          loadingMessage={t({ id: 'folder-picker.loading', message: 'Loading folders...' })}
          defaultOptions
          defaultValue={folder}
          inputValue={inputValue}
          onInputChange={onInputChange}
          value={folder}
          allowCustomValue={enableCreateNew && !customAdd}
          loadOptions={debouncedSearch}
          onChange={onFolderChange}
          onCreateOption={createNewFolder}
          isClearable={isClearable}
        />
      </div>
    );
  }
}

function mapSearchHitsToOptions(hits: DashboardSearchHit[], filterSlashes: boolean, filter?: FolderPickerFilter) {
  const filteredHits = filter ? filter(hits) : hits;
  if (filterSlashes) {
    return filteredHits
      .filter((value: DashboardSearchHit) => !containsSlashes(value.title ?? ''))
      .map((hit) => ({ label: hit.title, value: hit.id }));
  } else {
    return filteredHits.map((hit) => ({ label: hit.title, value: hit.id }));
  }
}
interface Args {
  getFolder: typeof getFolderById;
  folderId?: number;
  folderName?: string;
}

export async function getInitialValues({ folderName, folderId, getFolder }: Args): Promise<SelectableValue<number>> {
  if (folderId === null || folderId === undefined || folderId < 0) {
    throw new Error('folderId should to be greater or equal to zero.');
  }

  if (folderName) {
    return { label: folderName, value: folderId };
  }

  const folderDto = await getFolder(folderId);
  return { label: folderDto.title, value: folderId };
}

const getStyles = (theme: GrafanaTheme2) => ({
  newFolder: css`
    color: ${theme.colors.warning.main};
    font-size: ${theme.typography.bodySmall.fontSize};
    padding-bottom: ${theme.spacing(1)};
  `,
  slashNotAllowed: css`
    color: ${theme.colors.warning.main};
    font-size: 12px;
    margin-bottom: 2px;
  `,
  infoIcon: css`
    color: ${theme.colors.warning.main};
    font-size: 12px;
    margin-bottom: 2px;
    cursor: pointer;
  `,
});
