import PropTypes from 'prop-types';
import { memo } from 'react';
import { TabPane } from 'web-common/components';
import { useSelector } from 'react-redux';
import { pick } from 'web-common/utils';

import TagPicker from './tag-picker';


const Tags = ({ id, isActive, isReadOnly, ...rest }) => {
	const libraryKey = useSelector(state => state.current.libraryKey);
	const itemKey = useSelector(state => state.current.itemKey);
	return (
		<TabPane
			id={ id }
			className="tags"
			isActive={ isActive }
			{...pick(rest, p => p === 'role' || p.startsWith('data-') || p.startsWith('aria-'))}
		>
			<h5 className="h2 tab-pane-heading hidden-mouse">Tags</h5>
			<TagPicker itemKey={itemKey} libraryKey={libraryKey} isReadOnly={ isReadOnly } />
		</TabPane>
	)
}

Tags.propTypes = {
	id: PropTypes.string.isRequired,
	isActive: PropTypes.bool,
	isReadOnly: PropTypes.bool,
}

export default memo(Tags);
