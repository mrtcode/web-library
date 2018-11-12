'use strict';

const React = require('react');
const PropTypes = require('prop-types');
const cx = require('classnames');

const Icon = require('./ui/icon');
const Spinner = require('./ui/spinner');
const LibrariesContainer = require('../container/libraries');
const Button = require('./ui/button');
const ItemDetailsContainer = require('../container/item-details');
const ItemListContainer = require('../container/item-list');
const Navbar = require('./ui/navbar');
const TagSelectorContainer = require('../container/tag-selector');
const { Toolbar, ToolGroup } = require('./ui/toolbars');
const TouchHeaderContainer = require('../container/touch-header');
const UserTypeDetector = require('../enhancers/user-type-detector');
const { UserTypeContext } = require('../context');
const BibliographyContainer = require('../container/bibliography');

class Library extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			isNavOpened: false,
			hasUserTypeChanged: false
		};
	}

	handleNavToggle() {
		this.setState({
			isNavOpened: !this.state.isNavOpened
		});
	}

	componentDidUpdate({ userType: previousUserType }) {
		const { isKeyboardUser, isMouseUser, isTouchUser, userType } = this.props;
		const { hasUserTypeChanged } = this.state;

		document.documentElement.classList.toggle('keyboard', isKeyboardUser);
		document.documentElement.classList.toggle('mouse', isMouseUser);
		document.documentElement.classList.toggle('touch', isTouchUser);

		if(userType !== previousUserType) {
			this.setState({ hasUserTypeChanged: true });
		}
		if(hasUserTypeChanged === true) {
			window.setTimeout(() => this.setState({ hasUserTypeChanged: false }));
		}
	}

	componentWillUnmount() {
		document.documentElement.classList.toggle('keyboard', false);
		document.documentElement.classList.toggle('mouse', false);
		document.documentElement.classList.toggle('touch', false);
	}

	render() {
		const { itemsSource, collectionKey, useTransitions, userType, view } = this.props;
		const { isNavOpened, hasUserTypeChanged } = this.state;
		const key = itemsSource === 'collection' ?
			`collection-${collectionKey}` :
			itemsSource;
		let activeViewClass = `view-${view}-active`;

		return (
			<UserTypeContext.Provider value={ userType }>
				<div className={ cx('library-container', activeViewClass, {
						'navbar-nav-opened': isNavOpened,
						'no-transitions': !useTransitions || hasUserTypeChanged
					}) }>
					{
						!useTransitions && (
							<div className="loading-cover">
								<Spinner />
							</div>
						)
					}
					<Navbar
						isOpened = { isNavOpened }
						onToggle = { this.handleNavToggle.bind(this) }  />
					<div className="nav-cover" />
					<main>
						<section className={ `library ${ view === 'library' ? 'active' : '' }` }>
							<TouchHeaderContainer
								className="hidden-sm-up"
								includeItemsSource={ true }
								includeItem={ true }
							/>
							<header className="sidebar">
								<h2 className="offscreen">Web library</h2>
								<LibrariesContainer />
								<TagSelectorContainer key={ key } />
							</header>
							<section className={ `items ${ view === 'item-list' ? 'active' : '' }` }>
								<TouchHeaderContainer
									key={ key }
									className="hidden-xs-down hidden-md-up"
									includeItem={ true }
									rootAtCurrentItemsSource={ true }
								/>
								<ItemListContainer />
								<ItemDetailsContainer active={ view === 'item-details' } />
							</section>
						</section>
					</main>
					<BibliographyContainer />
				</div>
			</UserTypeContext.Provider>
		);
	}
}

Library.propTypes = {
	isKeyboardUser: PropTypes.bool,
	isMouseUser: PropTypes.bool,
	isTouchUser: PropTypes.bool,
	userType: PropTypes.string,
	view: PropTypes.string,
};

module.exports = UserTypeDetector(Library);
